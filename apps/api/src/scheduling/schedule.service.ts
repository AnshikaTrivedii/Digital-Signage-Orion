import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Schedule } from '@prisma/client';

import { parseCalendarDateInput, zonedWallTimeToUtc } from '../common/format-datetime';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateScheduleDto } from './dto/create-schedule.dto';
import type { UpdateScheduleDto } from './dto/update-schedule.dto';
import {
  deriveScheduleStatus,
  findConflicts,
  nextTransitionAt,
  resolveActiveSchedule,
  type ScheduleStatus,
} from './schedule-resolution';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export type ScheduleFilters = {
  status?: ScheduleStatus | 'all';
  deviceId?: string;
  playlistId?: string;
};

type ScheduleWithRefs = Schedule & {
  playlist: { id: string; name: string } | null;
  device: { id: string; name: string } | null;
};

/** Active schedule as exposed to the player sync payload. */
export type ActiveScheduleSnapshot = {
  scheduleId: string;
  scheduleName: string;
  playlistId: string;
  startDateTime: string;
  endDateTime: string;
};

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- CRUD

  async listSchedules(actor: RequestActor, filters: ScheduleFilters = {}) {
    const organizationId = this.getOrgId(actor);
    const timezone = await this.getTimezone(organizationId);
    const now = new Date();

    const schedules = await this.prisma.schedule.findMany({
      where: {
        organizationId,
        ...(filters.playlistId ? { playlistId: filters.playlistId } : {}),
        // "This device" must also surface all-devices schedules, because those
        // genuinely play on it.
        ...(filters.deviceId
          ? { OR: [{ deviceId: filters.deviceId }, { deviceId: null }] }
          : {}),
      },
      include: {
        playlist: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
      orderBy: [{ startDateTime: 'asc' }, { createdAt: 'asc' }],
    });

    const serialized = schedules.map((schedule) =>
      this.serialize(schedule, timezone, now),
    );

    const counts = serialized.reduce(
      (acc, schedule) => {
        acc[schedule.status] += 1;
        return acc;
      },
      { scheduled: 0, active: 0, completed: 0, disabled: 0 },
    );
    this.logger.log(
      `[SCHEDULE] list org=${organizationId} total=${serialized.length} ` +
        `scheduled=${counts.scheduled} active=${counts.active} completed=${counts.completed} disabled=${counts.disabled}`,
    );

    if (!filters.status || filters.status === 'all') return serialized;
    return serialized.filter((schedule) => schedule.status === filters.status);
  }

  async createSchedule(actor: RequestActor, body: CreateScheduleDto) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const timezone = await this.getTimezone(organizationId);

    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Schedule name is required');

    await this.assertPlaylistExists(organizationId, body.playlistId);
    const deviceId = body.deviceId ?? null;
    if (deviceId) await this.assertDeviceExists(organizationId, deviceId);

    const startDateTime = this.toInstant(body.startDate, body.startTime, timezone, 'start');
    const endDateTime = this.toInstant(body.endDate, body.endTime, timezone, 'end');
    this.assertValidWindow(startDateTime, endDateTime);

    const enabled = body.enabled ?? true;
    await this.assertNoConflict(organizationId, timezone, {
      deviceId,
      startDateTime,
      endDateTime,
      enabled,
    });

    const created = await this.prisma.schedule.create({
      data: {
        organizationId,
        name,
        playlistId: body.playlistId,
        deviceId,
        startDateTime,
        endDateTime,
        enabled,
      },
      include: {
        playlist: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `[SCHEDULE] created id=${created.id} name=${created.name} playlistId=${created.playlistId} ` +
        `deviceId=${deviceId ?? 'all'} start=${startDateTime.toISOString()} end=${endDateTime.toISOString()} ` +
        `enabled=${enabled}`,
    );
    return this.serialize(created, timezone, new Date());
  }

  async updateSchedule(actor: RequestActor, scheduleId: string, body: UpdateScheduleDto) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const timezone = await this.getTimezone(organizationId);
    const existing = await this.findSchedule(organizationId, scheduleId);

    const data: {
      name?: string;
      playlistId?: string;
      deviceId?: string | null;
      startDateTime?: Date;
      endDateTime?: Date;
      enabled?: boolean;
    } = {};

    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) throw new BadRequestException('Schedule name cannot be empty');
      data.name = trimmed;
    }

    if (body.playlistId !== undefined) {
      await this.assertPlaylistExists(organizationId, body.playlistId);
      data.playlistId = body.playlistId;
    }

    if (body.deviceId !== undefined) {
      const nextDeviceId = body.deviceId ?? null;
      if (nextDeviceId) await this.assertDeviceExists(organizationId, nextDeviceId);
      data.deviceId = nextDeviceId;
    }

    // Date and time are separate inputs, so recompute the instant whenever either
    // half moves, falling back to the stored wall-clock for the half left alone.
    if (body.startDate !== undefined || body.startTime !== undefined) {
      const wall = this.toWallClock(existing.startDateTime, timezone);
      data.startDateTime = this.toInstant(
        body.startDate ?? wall.date,
        body.startTime ?? wall.time,
        timezone,
        'start',
      );
    }
    if (body.endDate !== undefined || body.endTime !== undefined) {
      const wall = this.toWallClock(existing.endDateTime, timezone);
      data.endDateTime = this.toInstant(
        body.endDate ?? wall.date,
        body.endTime ?? wall.time,
        timezone,
        'end',
      );
    }

    if (body.enabled !== undefined) data.enabled = body.enabled;

    const nextStart = data.startDateTime ?? existing.startDateTime;
    const nextEnd = data.endDateTime ?? existing.endDateTime;
    this.assertValidWindow(nextStart, nextEnd);

    await this.assertNoConflict(
      organizationId,
      timezone,
      {
        id: scheduleId,
        deviceId: data.deviceId !== undefined ? data.deviceId : existing.deviceId,
        startDateTime: nextStart,
        endDateTime: nextEnd,
        enabled: data.enabled ?? existing.enabled,
      },
    );

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data,
      include: {
        playlist: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
    });

    return this.serialize(updated, timezone, new Date());
  }

  /** Flip enabled, or set it explicitly. Re-enabling re-runs conflict detection. */
  async toggleSchedule(actor: RequestActor, scheduleId: string, enabled?: boolean) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const timezone = await this.getTimezone(organizationId);
    const existing = await this.findSchedule(organizationId, scheduleId);
    const next = enabled ?? !existing.enabled;

    if (next) {
      await this.assertNoConflict(organizationId, timezone, {
        id: scheduleId,
        deviceId: existing.deviceId,
        startDateTime: existing.startDateTime,
        endDateTime: existing.endDateTime,
        enabled: true,
      });
    }

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { enabled: next },
      include: {
        playlist: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
    });

    return this.serialize(updated, timezone, new Date());
  }

  async deleteSchedule(actor: RequestActor, scheduleId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    await this.findSchedule(organizationId, scheduleId);
    this.logger.warn(
      `[SCHEDULE] explicit user delete id=${scheduleId} org=${organizationId} — historical row removed`,
    );
    await this.prisma.schedule.delete({ where: { id: scheduleId } });
    return { success: true };
  }

  // ------------------------------------------------- resolution (player path)

  /**
   * The schedule that should be driving this device right now, or null.
   *
   * Only enabled schedules whose window contains `now` are considered, and the
   * winner is chosen deterministically (see resolveActiveSchedule).
   */
  async resolveActiveScheduleForDevice(
    organizationId: string,
    deviceId: string,
    now: Date = new Date(),
  ): Promise<ActiveScheduleSnapshot | null> {
    const candidates = await this.prisma.schedule.findMany({
      where: {
        organizationId,
        enabled: true,
        startDateTime: { lte: now },
        endDateTime: { gt: now },
        OR: [{ deviceId }, { deviceId: null }],
      },
      select: {
        id: true,
        name: true,
        deviceId: true,
        playlistId: true,
        startDateTime: true,
        endDateTime: true,
        enabled: true,
      },
    });

    const winner = resolveActiveSchedule(candidates, deviceId, now);
    if (!winner) return null;

    return {
      scheduleId: winner.id,
      scheduleName: winner.name,
      playlistId: winner.playlistId,
      startDateTime: winner.startDateTime.toISOString(),
      endDateTime: winner.endDateTime.toISOString(),
    };
  }

  /**
   * Next instant when this device's effective content may change (schedule
   * start or end). Exposed to the player so it can wake exactly at boundaries
   * instead of waiting only for the next poll.
   */
  async nextContentChangeAtForDevice(
    organizationId: string,
    deviceId: string,
    now: Date = new Date(),
  ): Promise<Date | null> {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        organizationId,
        enabled: true,
        OR: [{ deviceId }, { deviceId: null }],
      },
      select: {
        id: true,
        deviceId: true,
        startDateTime: true,
        endDateTime: true,
        enabled: true,
      },
    });
    return nextTransitionAt(schedules, deviceId, now);
  }

  /**
   * Resolve which playlist was driving the device at an arbitrary past instant.
   * Used by Proof-of-Play so delayed uploads after schedule expiry still attribute
   * to the playlist that was actually playing when the asset started.
   */
  async resolvePlaylistIdAt(
    organizationId: string,
    deviceId: string,
    at: Date,
    fallbackPlaylistId: string | null,
  ): Promise<string | null> {
    const active = await this.resolveActiveScheduleForDevice(organizationId, deviceId, at);
    return active?.playlistId ?? fallbackPlaylistId;
  }

  // ----------------------------------------------------- conflict detection

  private async assertNoConflict(
    organizationId: string,
    timezone: string,
    candidate: {
      id?: string;
      deviceId: string | null;
      startDateTime: Date;
      endDateTime: Date;
      enabled: boolean;
    },
  ) {
    if (!candidate.enabled) return;

    const existing = await this.prisma.schedule.findMany({
      where: {
        organizationId,
        enabled: true,
        ...(candidate.id ? { id: { not: candidate.id } } : {}),
        // Overlap prefilter in SQL; findConflicts re-checks exactly.
        startDateTime: { lt: candidate.endDateTime },
        endDateTime: { gt: candidate.startDateTime },
        // An all-devices candidate collides with everything, so no target filter.
        ...(candidate.deviceId
          ? { OR: [{ deviceId: candidate.deviceId }, { deviceId: null }] }
          : {}),
      },
      include: {
        playlist: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
    });

    const conflicts = findConflicts(candidate, existing);
    if (conflicts.length === 0) return;

    const first = conflicts[0];
    const target = candidate.deviceId
      ? first.deviceId === null
        ? 'an all-devices schedule'
        : 'this device'
      : 'one or more devices';

    throw new ConflictException({
      error: 'Schedule Conflict',
      message: `The selected device already has a schedule during this period. "${first.name}" covers ${this.describeWindow(first.startDateTime, first.endDateTime, timezone)}.`,
      conflicts: conflicts.map((conflict) => ({
        id: conflict.id,
        name: conflict.name,
        deviceId: conflict.deviceId,
        deviceName: conflict.device?.name ?? null,
        playlistName: conflict.playlist?.name ?? null,
        startDateTime: conflict.startDateTime.toISOString(),
        endDateTime: conflict.endDateTime.toISOString(),
      })),
      target,
    });
  }

  // -------------------------------------------------------------- helpers

  /**
   * Convert operator wall-clock input into an absolute instant using the org zone.
   * Every stored timestamp is UTC, so later comparisons never mix representations.
   */
  private toInstant(date: string, time: string, timezone: string, label: 'start' | 'end'): Date {
    const calendar = parseCalendarDateInput(date);
    if (!calendar) throw new BadRequestException(`${label}Date must be a valid YYYY-MM-DD date`);

    const [hourRaw, minuteRaw] = time.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      throw new BadRequestException(`${label}Time must be a valid HH:MM time`);
    }

    const instant = zonedWallTimeToUtc(calendar, hour, minute, 0, 0, timezone);
    if (Number.isNaN(instant.getTime())) {
      throw new BadRequestException(`${label} date/time is not a valid instant`);
    }
    return instant;
  }

  /** Inverse of toInstant — the wall-clock the operator originally typed. */
  private toWallClock(instant: Date, timezone: string): { date: string; time: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(instant);

    const pick = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    return {
      date: `${pick('year')}-${pick('month')}-${pick('day')}`,
      time: `${pick('hour')}:${pick('minute')}`,
    };
  }

  private describeWindow(start: Date, end: Date, timezone: string): string {
    const startWall = this.toWallClock(start, timezone);
    const endWall = this.toWallClock(end, timezone);
    return startWall.date === endWall.date
      ? `${startWall.date} ${startWall.time}–${endWall.time}`
      : `${startWall.date} ${startWall.time} – ${endWall.date} ${endWall.time}`;
  }

  private assertValidWindow(start: Date, end: Date) {
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('End date/time must be after start date/time');
    }
  }

  private serialize(schedule: ScheduleWithRefs, timezone: string, now: Date) {
    const startWall = this.toWallClock(schedule.startDateTime, timezone);
    const endWall = this.toWallClock(schedule.endDateTime, timezone);

    return {
      id: schedule.id,
      name: schedule.name,
      playlistId: schedule.playlistId,
      playlistName: schedule.playlist?.name ?? null,
      deviceId: schedule.deviceId,
      deviceName: schedule.device?.name ?? null,
      allDevices: schedule.deviceId === null,
      // Absolute instants for machines.
      startDateTime: schedule.startDateTime.toISOString(),
      endDateTime: schedule.endDateTime.toISOString(),
      // Wall-clock in the org zone for the table and the edit form.
      startDate: startWall.date,
      startTime: startWall.time,
      endDate: endWall.date,
      endTime: endWall.time,
      timezone,
      enabled: schedule.enabled,
      status: deriveScheduleStatus(schedule, now),
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    };
  }

  private async findSchedule(organizationId: string, scheduleId: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, organizationId },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  private async assertPlaylistExists(organizationId: string, playlistId: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId },
      select: { id: true },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');
  }

  private async assertDeviceExists(organizationId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not found');
  }

  async getTimezone(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return organization?.timezone || DEFAULT_TIMEZONE;
  }

  private getOrgId(actor: RequestActor): string {
    const organizationId = actor.organization?.id;
    if (!organizationId) throw new ForbiddenException('Missing organization context');
    return organizationId;
  }

  private assertCanEdit(actor: RequestActor) {
    if (!actor.organization) throw new ForbiddenException('Missing organization context');
    if (actor.organization.role === 'ANALYST_VIEWER') {
      throw new ForbiddenException('Read-only access');
    }
  }
}
