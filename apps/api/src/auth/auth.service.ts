import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InvitationStatus, MembershipStatus, OrganizationRole, OrganizationStatus, PlatformRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async bootstrapSuperAdmin(dto: BootstrapSuperAdminDto) {
    const existing = await this.prisma.user.count({
      where: { platformRole: PlatformRole.SUPER_ADMIN },
    });

    if (existing > 0) {
      throw new ForbiddenException('Super admin bootstrap already completed');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        passwordHash,
        platformRole: PlatformRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    await this.auditService.log({
      actorUserId: user.id,
      action: 'bootstrap.super_admin.created',
      targetType: 'user',
      targetId: user.id,
      summary: `Bootstrapped first super admin ${user.email}`,
    });

    return this.createSessionResponse(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: {
            organization: true,
            permissions: {
              select: { featureKey: true, accessLevel: true },
              orderBy: { featureKey: 'asc' },
            },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createSessionResponse(user.id);
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
      include: { organization: true },
    });

    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new NotFoundException('Invitation not found or no longer valid');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new BadRequestException('Invitation expired');
    }

    if (invitation.organization.status !== OrganizationStatus.ACTIVE && invitation.role !== OrganizationRole.ORG_ADMIN) {
      throw new ForbiddenException('Organization must be active before onboarding members');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const email = invitation.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: {
          email,
          fullName: dto.fullName,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      }));

    if (existingUser) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          fullName: dto.fullName,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });
    }

    const membership = await this.prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invitation.organizationId,
        },
      },
      update: {
        role: invitation.role,
        status: MembershipStatus.ACTIVE,
      },
      create: {
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
        status: MembershipStatus.ACTIVE,
      },
    });

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
        acceptedByUserId: user.id,
      },
    });

    await this.auditService.log({
      actorUserId: user.id,
      organizationId: invitation.organizationId,
      action: 'invitation.accepted',
      targetType: 'membership',
      targetId: membership.id,
      summary: `${email} accepted ${invitation.role} invitation for ${invitation.organization.name}`,
    });

    return this.createSessionResponse(user.id);
  }

  async me(actor: RequestActor) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      include: {
        memberships: {
          include: {
            organization: true,
            permissions: {
              select: { featureKey: true, accessLevel: true },
              orderBy: { featureKey: 'asc' },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memberships = user.memberships
      .map((membership) => ({
        id: membership.id,
        role: membership.role,
        status: membership.status,
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          status: membership.organization.status,
        },
        permissions: membership.permissions,
      }))
      .sort((left, right) => left.organization.name.localeCompare(right.organization.name));

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      platformRole: user.platformRole,
      memberships,
      activeOrganization: actor.organization ?? null,
    };
  }

  async resolveActorFromToken(token: string, scope: { organizationId?: string; organizationSlug?: string }) {
    let payload: { sub: string };

    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET ?? 'orion-dev-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: {
            organization: true,
            permissions: {
              select: { featureKey: true, accessLevel: true },
              orderBy: { featureKey: 'asc' },
            },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not available');
    }

    const actor: RequestActor = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      platformRole: user.platformRole,
    };

    const orgMembership = user.memberships.find((membership) => {
      if (scope.organizationId) {
        return membership.organizationId === scope.organizationId;
      }
      if (scope.organizationSlug) {
        return membership.organization.slug === scope.organizationSlug;
      }
      return false;
    });

    const fallbackMembership = !scope.organizationId && !scope.organizationSlug && user.memberships.length === 1
      ? user.memberships[0]
      : undefined;

    if (orgMembership || fallbackMembership) {
      const resolvedMembership = orgMembership ?? fallbackMembership!;
      actor.organization = {
        id: resolvedMembership.organization.id,
        slug: resolvedMembership.organization.slug,
        role: resolvedMembership.role,
        status: resolvedMembership.organization.status,
      };
      return actor;
    }

    const canImpersonateOrganization =
      user.platformRole === PlatformRole.SUPER_ADMIN ||
      user.platformRole === PlatformRole.PLATFORM_ADMIN ||
      user.platformRole === PlatformRole.SALES ||
      user.platformRole === PlatformRole.SUPPORT;

    if (canImpersonateOrganization && (scope.organizationId || scope.organizationSlug)) {
      const organization = await this.prisma.organization.findFirst({
        where: scope.organizationId
          ? { id: scope.organizationId }
          : scope.organizationSlug
            ? { slug: scope.organizationSlug }
            : undefined,
      });

      if (!organization) {
        throw new NotFoundException('Organization not found for requested context');
      }

      actor.organization = {
        id: organization.id,
        slug: organization.slug,
        role: OrganizationRole.ORG_ADMIN,
        status: organization.status,
      };
    }

    return actor;
  }

  async issueInvitationToken() {
    return randomBytes(24).toString('hex');
  }

  private async createSessionResponse(userId: string) {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: process.env.JWT_SECRET ?? 'orion-dev-secret',
        expiresIn: '12h',
      },
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
            permissions: {
              select: { featureKey: true, accessLevel: true },
              orderBy: { featureKey: 'asc' },
            },
          },
        },
      },
    });

    return {
      accessToken,
      user: {
        id: user?.id,
        email: user?.email,
        fullName: user?.fullName,
        platformRole: user?.platformRole ?? null,
        memberships:
          user?.memberships.map((membership) => ({
            organizationId: membership.organizationId,
            organizationName: membership.organization.name,
            organizationSlug: membership.organization.slug,
            role: membership.role,
            status: membership.status,
            permissions: membership.permissions,
          })) ?? [],
      },
    };
  }
}
