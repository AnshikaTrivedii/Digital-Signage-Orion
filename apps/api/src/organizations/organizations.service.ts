import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeatureAccessLevel, FeatureKey, InvitationScope, InvitationStatus, MembershipStatus, OrganizationRole, OrganizationStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ActivateOrganizationDto } from './dto/activate-organization.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteFirstAdminDto } from './dto/invite-first-admin.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberPermissionsDto } from './dto/update-member-permissions.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
  ) {}

  async createOrganization(actor: RequestActor, dto: CreateOrganizationDto) {
    const slug = dto.slug.toLowerCase();
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('Organization slug already exists');
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        primaryContactName: dto.primaryContactName,
        primaryContactEmail: dto.primaryContactEmail?.toLowerCase(),
        salesNotes: dto.salesNotes,
        status: OrganizationStatus.DRAFT,
      },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId: organization.id,
      action: 'organization.created',
      targetType: 'organization',
      targetId: organization.id,
      summary: `${actor.email} created draft organization ${organization.name}`,
      metadata: { slug: organization.slug, byRole: actor.platformRole },
    });

    return organization;
  }

  async listOrganizations(actor: RequestActor) {
    const where =
      actor.platformRole
        ? {}
        : actor.organization
          ? { id: actor.organization.id }
          : { id: '__none__' };

    return this.prisma.organization.findMany({
      where,
      include: {
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            userId: true,
            permissions: {
              select: { featureKey: true, accessLevel: true },
              orderBy: { featureKey: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrganization(actor: RequestActor, organizationId: string) {
    await this.ensureOrganizationAccess(actor, organizationId);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                status: true,
                platformRole: true,
              },
            },
            permissions: {
              select: { id: true, featureKey: true, accessLevel: true },
              orderBy: { featureKey: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        invitations: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async activateOrganization(actor: RequestActor, organizationId: string, dto: ActivateOrganizationDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { status: OrganizationStatus.ACTIVE },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'organization.activated',
      targetType: 'organization',
      targetId: organizationId,
      summary: `${actor.email} activated organization ${organization.name}`,
      metadata: { activationNote: dto.activationNote ?? null },
    });

    return updated;
  }

  async inviteFirstAdmin(actor: RequestActor, organizationId: string, dto: InviteFirstAdminDto) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        memberships: {
          where: { role: OrganizationRole.ORG_ADMIN, status: MembershipStatus.ACTIVE },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.memberships.length > 0) {
      throw new ConflictException('Organization already has an active org admin');
    }

    const pendingAdminInvitation = await this.prisma.invitation.findFirst({
      where: {
        organizationId,
        role: OrganizationRole.ORG_ADMIN,
        status: InvitationStatus.PENDING,
      },
    });

    if (pendingAdminInvitation) {
      throw new ConflictException('Organization already has a pending first-admin invitation');
    }

    const invitation = await this.createInvitation({
      actor,
      organizationId,
      email: dto.email,
      fullName: dto.fullName,
      role: OrganizationRole.ORG_ADMIN,
      action: 'organization.first_admin_invited',
      summary: `${actor.email} invited ${dto.email.toLowerCase()} as first org admin for ${organization.name}`,
      message: dto.message,
    });

    return invitation;
  }

  async listMembers(actor: RequestActor, organizationId: string) {
    await this.ensureOrganizationAccess(actor, organizationId);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                status: true,
                platformRole: true,
              },
            },
            permissions: {
              select: { id: true, featureKey: true, accessLevel: true },
              orderBy: { featureKey: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        invitations: {
          where: { status: InvitationStatus.PENDING },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async inviteMember(actor: RequestActor, organizationId: string, dto: InviteMemberDto) {
    await this.ensureOrgAdminPrivileges(actor, organizationId);

    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new BadRequestException('Organization must be active before inviting members');
    }

    return this.createInvitation({
      actor,
      organizationId,
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      action: 'organization.member_invited',
      summary: `${actor.email} invited ${dto.email.toLowerCase()} as ${dto.role} for ${organization.name}`,
      message: dto.message,
    });
  }

  async createMember(actor: RequestActor, organizationId: string, dto: CreateMemberDto) {
    await this.ensureOrgAdminPrivileges(actor, organizationId);

    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new BadRequestException('Organization must be active before adding users');
    }

    const email = dto.email.toLowerCase();
    const normalizedPermissions = this.normalizePermissions(dto.permissions);

    const existingMembership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, user: { email } },
    });

    if (existingMembership) {
      throw new ConflictException('User already has access to this organization');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
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

    const membership = await this.prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId,
        role: OrganizationRole.MANAGER,
        status: MembershipStatus.ACTIVE,
      },
    });

    await this.syncMembershipPermissions(membership.id, normalizedPermissions);

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'membership.created',
      targetType: 'membership',
      targetId: membership.id,
      summary: `${actor.email} created ${email} in ${organization.name}`,
      metadata: { permissions: normalizedPermissions },
    });

    return this.prisma.organizationMembership.findUnique({
      where: { id: membership.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
            platformRole: true,
          },
        },
        permissions: {
          select: { id: true, featureKey: true, accessLevel: true },
          orderBy: { featureKey: 'asc' },
        },
      },
    });
  }

  async updateMemberRole(actor: RequestActor, organizationId: string, membershipId: string, dto: UpdateMemberRoleDto) {
    await this.ensureOrgAdminPrivileges(actor, organizationId);

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: { user: true, organization: true },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    await this.assertOrgAdminSafety({
      organizationId,
      targetMembershipId: membershipId,
      nextRole: dto.role,
      action: 'change role',
    });

    const updated = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: { role: dto.role },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'membership.role_updated',
      targetType: 'membership',
      targetId: membershipId,
      summary: `${actor.email} changed ${membership.user.email} to ${dto.role} in ${membership.organization.name}`,
      metadata: { previousRole: membership.role, nextRole: dto.role },
    });

    return updated;
  }

  async removeMember(actor: RequestActor, organizationId: string, membershipId: string) {
    await this.ensureOrgAdminPrivileges(actor, organizationId);

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: { user: true, organization: true },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    await this.assertOrgAdminSafety({
      organizationId,
      targetMembershipId: membershipId,
      action: 'remove member',
    });

    await this.prisma.organizationMembership.delete({ where: { id: membershipId } });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'membership.removed',
      targetType: 'membership',
      targetId: membershipId,
      summary: `${actor.email} removed ${membership.user.email} from ${membership.organization.name}`,
    });

    return { success: true };
  }

  async updateMemberPermissions(actor: RequestActor, organizationId: string, membershipId: string, dto: UpdateMemberPermissionsDto) {
    await this.ensureOrgAdminPrivileges(actor, organizationId);

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: { user: true, organization: true },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const normalizedPermissions = this.normalizePermissions(dto.permissions);
    await this.syncMembershipPermissions(membershipId, normalizedPermissions);

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'membership.permissions_updated',
      targetType: 'membership',
      targetId: membershipId,
      summary: `${actor.email} updated permissions for ${membership.user.email} in ${membership.organization.name}`,
      metadata: { permissions: normalizedPermissions },
    });

    return this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
            platformRole: true,
          },
        },
        permissions: {
          select: { id: true, featureKey: true, accessLevel: true },
          orderBy: { featureKey: 'asc' },
        },
      },
    });
  }

  private async createInvitation(params: {
    actor: RequestActor;
    organizationId: string;
    email: string;
    fullName: string;
    role: OrganizationRole;
    action: string;
    summary: string;
    message?: string;
  }) {
    const email = params.email.toLowerCase();

    const pendingMembership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: params.organizationId,
        user: { email },
      },
    });

    if (pendingMembership) {
      throw new ConflictException('User already has access to this organization');
    }

    const existingPendingInvitation = await this.prisma.invitation.findFirst({
      where: {
        organizationId: params.organizationId,
        email,
        status: InvitationStatus.PENDING,
      },
    });

    if (existingPendingInvitation) {
      throw new ConflictException('A pending invitation already exists for this email');
    }

    const token = await this.authService.issueInvitationToken();
    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        token,
        scope: InvitationScope.ORGANIZATION,
        organizationId: params.organizationId,
        role: params.role,
        invitedById: params.actor.userId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });

    await this.auditService.log({
      actorUserId: params.actor.userId,
      organizationId: params.organizationId,
      action: params.action,
      targetType: 'invitation',
      targetId: invitation.id,
      summary: params.summary,
      metadata: { email, fullName: params.fullName, role: params.role, message: params.message ?? null },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
    };
  }

  private async ensureOrganizationAccess(actor: RequestActor, organizationId: string) {
    if (actor.platformRole === 'SUPER_ADMIN' || actor.platformRole === 'PLATFORM_ADMIN' || actor.platformRole === 'SUPPORT') {
      return;
    }

    if (actor.organization?.id === organizationId) {
      return;
    }

    throw new ForbiddenException('No access to this organization');
  }

  private async ensureOrgAdminPrivileges(actor: RequestActor, organizationId: string) {
    if (actor.platformRole === 'SUPER_ADMIN' || actor.platformRole === 'PLATFORM_ADMIN') {
      return;
    }

    throw new ForbiddenException('Only platform admins can manage tenant members');
  }

  private async assertOrgAdminSafety(params: {
    organizationId: string;
    targetMembershipId: string;
    nextRole?: OrganizationRole;
    action: string;
  }) {
    const targetMembership = await this.prisma.organizationMembership.findUnique({
      where: { id: params.targetMembershipId },
    });

    if (!targetMembership || targetMembership.organizationId !== params.organizationId) {
      throw new NotFoundException('Membership not found');
    }

    const willRemainOrgAdmin = params.nextRole === OrganizationRole.ORG_ADMIN;
    if (targetMembership.role !== OrganizationRole.ORG_ADMIN || willRemainOrgAdmin) {
      return;
    }

    const remainingAdmins = await this.prisma.organizationMembership.count({
      where: {
        organizationId: params.organizationId,
        role: OrganizationRole.ORG_ADMIN,
        status: MembershipStatus.ACTIVE,
        id: { not: params.targetMembershipId },
      },
    });

    if (remainingAdmins === 0) {
      throw new BadRequestException(`Cannot ${params.action} because every organization needs at least one org admin`);
    }
  }

  private normalizePermissions(
    permissions: Array<{ featureKey: FeatureKey; accessLevel: FeatureAccessLevel }>,
  ) {
    const unique = new Map<FeatureKey, FeatureAccessLevel>();

    for (const permission of permissions) {
      unique.set(permission.featureKey, permission.accessLevel);
    }

    return Array.from(unique.entries())
      .map(([featureKey, accessLevel]) => ({ featureKey, accessLevel }))
      .sort((left, right) => left.featureKey.localeCompare(right.featureKey));
  }

  private async syncMembershipPermissions(
    membershipId: string,
    permissions: Array<{ featureKey: FeatureKey; accessLevel: FeatureAccessLevel }>,
  ) {
    await this.prisma.membershipFeaturePermission.deleteMany({ where: { membershipId } });

    if (permissions.length === 0) {
      return;
    }

    await this.prisma.membershipFeaturePermission.createMany({
      data: permissions.map((permission) => ({
        membershipId,
        featureKey: permission.featureKey,
        accessLevel: permission.accessLevel,
      })),
    });
  }
}
