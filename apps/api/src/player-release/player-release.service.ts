import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceAppUpdateState, PlayerReleaseStatus } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { createReadStream } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

const run = promisify(execFile);
const MAX_APK_BYTES = 200 * 1024 * 1024;
const STATES = Object.values(DeviceAppUpdateState);

export async function inspectPlayerApk(path: string) {
  const [{ stdout: badge }, { stdout: signature }] = await Promise.all([
    run('aapt', ['dump', 'badging', path], { maxBuffer: 2_000_000 }),
    run('apksigner', ['verify', '--print-certs', path], { maxBuffer: 2_000_000 }),
  ]);
  return parsePlayerApkMetadata(badge, signature);
}

export function parsePlayerApkMetadata(badge: string, signature: string) {
  const packageLine = badge.split('\n').find((line) => line.startsWith('package:')) ?? '';
  const packageName = /name='([^']+)'/.exec(packageLine)?.[1];
  const versionCode = Number(/versionCode='(\d+)'/.exec(packageLine)?.[1]);
  const versionName = /versionName='([^']+)'/.exec(packageLine)?.[1];
  const signers = [...signature.matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9:]+)/g)];
  const certificate = signers.length === 1
    ? signers[0][1].replace(/:/g, '').toLowerCase() : undefined;
  if (packageName !== 'com.orion.player' || !Number.isSafeInteger(versionCode) || versionCode <= 0 ||
      !versionName || !certificate) {
    throw new BadRequestException('Invalid Orion player APK metadata or signature');
  }
  return { versionCode, versionName, certificate };
}

@Injectable()
export class PlayerReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const releases = await this.prisma.playerRelease.findMany({
      orderBy: { createdAt: 'desc' },
      include: { deviceUpdates: { select: { state: true } } },
    });
    const activeId = releases.find((release) => release.status === PlayerReleaseStatus.ACTIVE)?.id;
    const devices = await this.prisma.device.findMany({
      where: { isPaired: true },
      select: { id: true, name: true, playerVersion: true, playerVersionCode: true, deviceOwner: true,
        silentUpdateCapable: true, lastSeenAt: true, appUpdates: {
          ...(activeId ? { where: { releaseId: activeId } } : {}),
          orderBy: { updatedAt: 'desc' }, take: 1,
          select: { releaseId: true, state: true, progress: true, error: true, retryCount: true, updatedAt: true },
        } },
    });
    return {
      releases: releases.map(({ deviceUpdates, ...release }) => ({
        ...release,
        counts: deviceUpdates.reduce((counts, update) => {
          counts[update.state] = (counts[update.state] ?? 0) + 1;
          return counts;
        }, {} as Record<string, number>),
      })),
      devices,
    };
  }

  async createDraft(actorId: string, sizeBytes: number, sha256: string, notes = '') {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_APK_BYTES) {
      throw new BadRequestException('APK size must be between 1 byte and 200 MB');
    }
    if (!/^[a-fA-F0-9]{64}$/.test(sha256 ?? '')) {
      throw new BadRequestException('APK SHA-256 is required');
    }
    const apkKey = `player-releases/${randomUUID()}/player.apk`;
    const release = await this.prisma.playerRelease.create({
      data: { apkKey, sizeBytes, sha256: sha256.toLowerCase(), notes: notes.slice(0, 2000), createdById: actorId },
    });
    const uploadUrl = this.s3.useLocalStorage
      ? null
      : await this.s3.generateUploadUrl(apkKey, 'application/vnd.android.package-archive');
    return { release, uploadUrl, localUploadPath: uploadUrl ? null : `/api/platform/player-releases/${release.id}/apk` };
  }

  async localUpload(id: string, data: Buffer) {
    if (!this.s3.useLocalStorage) throw new BadRequestException('Direct API upload is disabled');
    const release = await this.prisma.playerRelease.findUnique({ where: { id } });
    if (!release || release.status !== PlayerReleaseStatus.DRAFT || release.verifiedAt) {
      throw new NotFoundException('Unverified draft release not found');
    }
    if (data.length !== release.sizeBytes) throw new BadRequestException('APK size mismatch');
    await this.s3.saveLocalFile(release.apkKey, data);
    return { received: true };
  }

  async confirm(id: string, actorId: string) {
    const release = await this.prisma.playerRelease.findUnique({ where: { id } });
    if (!release || release.status !== PlayerReleaseStatus.DRAFT) {
      throw new NotFoundException('Draft release not found');
    }
    if (release.verifiedAt) return release;
    const expectedCert = process.env.PLAYER_RELEASE_CERT_SHA256?.replace(/:/g, '').toLowerCase();
    if (!expectedCert || !/^[a-f0-9]{64}$/.test(expectedCert)) {
      throw new BadRequestException('PLAYER_RELEASE_CERT_SHA256 must be configured');
    }
    const directory = await mkdtemp(join(tmpdir(), 'orion-release-'));
    const path = join(directory, 'player.apk');
    try {
      const object = await this.s3.headObject(release.apkKey);
      if (!object || object.contentLength !== release.sizeBytes) {
        throw new BadRequestException('Uploaded APK size does not match the draft');
      }
      await this.s3.downloadObjectToFile(release.apkKey, path);
      const fileInfo = await stat(path);
      if (fileInfo.size !== release.sizeBytes || fileInfo.size > MAX_APK_BYTES) {
        throw new BadRequestException('Uploaded APK size does not match the draft');
      }
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      const sha256 = hash.digest('hex');
      if (sha256 !== release.sha256) throw new BadRequestException('Uploaded APK SHA-256 mismatch');
      let metadata: Awaited<ReturnType<typeof inspectPlayerApk>>;
      try {
        metadata = await inspectPlayerApk(path);
      } catch {
        throw new BadRequestException('APK verification failed; check package, signature, and Android build tools');
      }
      if (metadata.certificate !== expectedCert) {
        throw new BadRequestException('APK signing certificate differs from the production certificate');
      }
      const latest = await this.prisma.playerRelease.findFirst({
        where: { activatedAt: { not: null } }, orderBy: { versionCode: 'desc' },
      });
      if (metadata.versionCode <= (latest?.versionCode ?? 0)) {
        throw new BadRequestException('APK versionCode must exceed all previously activated releases');
      }
      const verifiedKey = release.apkKey.replace('/player.apk', '/verified.apk');
      await this.s3.uploadVerifiedFile(verifiedKey, path, fileInfo.size);
      const verified = await this.prisma.playerRelease.update({
        where: { id },
        data: { apkKey: verifiedKey, versionCode: metadata.versionCode, versionName: metadata.versionName,
          signingCertSha256: metadata.certificate, sha256, verifiedAt: new Date() },
      });
      await this.audit.log({ actorUserId: actorId, action: 'PLAYER_RELEASE_VERIFY', targetType: 'PlayerRelease',
        targetId: id, summary: `Verified player APK ${metadata.versionName} (${metadata.versionCode})` });
      return verified;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async activate(id: string, actorId: string) {
    const release = await this.prisma.playerRelease.findUnique({ where: { id } });
    if (release?.status !== PlayerReleaseStatus.DRAFT || !release.verifiedAt ||
        !release.versionCode || !release.sha256) {
      throw new BadRequestException('Draft release must be verified before activation');
    }
    const latest = await this.prisma.playerRelease.findFirst({
      where: { activatedAt: { not: null }, id: { not: id } }, orderBy: { versionCode: 'desc' },
    });
    if (release.versionCode <= (latest?.versionCode ?? 0)) {
      throw new BadRequestException('Release must have a newer versionCode than all earlier activations');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.playerRelease.updateMany({ where: { status: PlayerReleaseStatus.ACTIVE },
        data: { status: PlayerReleaseStatus.INACTIVE } });
      await tx.playerRelease.update({ where: { id }, data: {
        status: PlayerReleaseStatus.ACTIVE, activatedAt: new Date(),
      } });
      const devices = await tx.device.findMany({
        where: { isPaired: true, playerVersionCode: { lt: release.versionCode! } }, select: { id: true },
      });
      await tx.deviceAppUpdate.createMany({
        data: devices.map((device) => ({ deviceId: device.id, releaseId: id })),
        skipDuplicates: true,
      });
    });
    await this.audit.log({ actorUserId: actorId, action: 'PLAYER_RELEASE_ACTIVATE',
      targetType: 'PlayerRelease', targetId: id,
      summary: `Activated player version ${release.versionName} for the fleet` });
    return { active: true };
  }

  async deactivate(id: string, actorId: string) {
    const release = await this.prisma.playerRelease.findUnique({ where: { id } });
    if (!release || release.status !== PlayerReleaseStatus.ACTIVE) {
      throw new NotFoundException('Active release not found');
    }
    await this.prisma.playerRelease.update({ where: { id }, data: { status: PlayerReleaseStatus.INACTIVE } });
    await this.audit.log({ actorUserId: actorId, action: 'PLAYER_RELEASE_DEACTIVATE',
      targetType: 'PlayerRelease', targetId: id,
      summary: `Deactivated player version ${release.versionName}` });
    return { active: false };
  }

  async available(deviceId: string, currentVersionCode: number) {
    const release = await this.prisma.playerRelease.findFirst({
      where: { status: PlayerReleaseStatus.ACTIVE },
    });
    if (!release?.versionCode || !release.sizeBytes || !release.sha256 ||
        release.versionCode <= currentVersionCode) return null;
    const existing = await this.prisma.deviceAppUpdate.findUnique({
      where: { deviceId_releaseId: { deviceId, releaseId: release.id } },
    });
    if (existing?.state === DeviceAppUpdateState.BLOCKED ||
        existing?.state === DeviceAppUpdateState.HEALTHY) return null;
    if (!existing) await this.prisma.deviceAppUpdate.create({
      data: { deviceId, releaseId: release.id },
    });
    return {
      releaseId: release.id, versionCode: release.versionCode, versionName: release.versionName,
      sizeBytes: release.sizeBytes, sha256: release.sha256,
      downloadUrl: await this.s3.generateDownloadUrl(release.apkKey, 3600),
    };
  }

  async report(deviceId: string, body: {
    releaseId: string; state: string; progress?: number; error?: string; retryCount?: number;
    installedVersionCode?: number;
  }) {
    if (!STATES.includes(body.state as DeviceAppUpdateState)) {
      throw new BadRequestException('Unknown app update state');
    }
    if (body.state === DeviceAppUpdateState.BLOCKED && !body.error?.trim()) {
      throw new BadRequestException('Blocked update reports require an error reason');
    }
    const release = await this.prisma.playerRelease.findUnique({ where: { id: body.releaseId } });
    if (!release) throw new NotFoundException('Release not found');
    const current = await this.prisma.deviceAppUpdate.findUnique({
      where: { deviceId_releaseId: { deviceId, releaseId: release.id } },
    });
    if (current?.state === DeviceAppUpdateState.BLOCKED || current?.state === DeviceAppUpdateState.HEALTHY) {
      return current;
    }
    if (body.state === DeviceAppUpdateState.HEALTHY &&
        body.installedVersionCode !== release.versionCode) {
      throw new BadRequestException('Installed version does not match release');
    }
    return this.prisma.deviceAppUpdate.upsert({
      where: { deviceId_releaseId: { deviceId, releaseId: release.id } },
      create: { deviceId, releaseId: release.id, state: body.state as DeviceAppUpdateState,
        progress: Math.max(0, Math.min(100, body.progress ?? 0)),
        error: body.error?.slice(0, 1000), retryCount: Math.max(0, body.retryCount ?? 0) },
      update: { state: body.state as DeviceAppUpdateState,
        progress: Math.max(0, Math.min(100, body.progress ?? current?.progress ?? 0)),
        error: body.error?.slice(0, 1000) ?? null,
        retryCount: Math.max(0, body.retryCount ?? current?.retryCount ?? 0) },
    });
  }
}
