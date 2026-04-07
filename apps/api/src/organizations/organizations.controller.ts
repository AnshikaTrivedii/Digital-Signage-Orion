import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/platform-roles.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { PlatformRoles } from '../common/decorators/platform-roles.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { ActivateOrganizationDto } from './dto/activate-organization.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteFirstAdminDto } from './dto/invite-first-admin.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  listOrganizations(@CurrentActor() actor: RequestActor) {
    return this.organizationsService.listOrganizations(actor);
  }

  @Get(':organizationId')
  getOrganization(@CurrentActor() actor: RequestActor, @Param('organizationId') organizationId: string) {
    return this.organizationsService.getOrganization(actor, organizationId);
  }

  @Post()
  @UseGuards(PlatformRolesGuard)
  @PlatformRoles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'SALES')
  createOrganization(@CurrentActor() actor: RequestActor, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.createOrganization(actor, dto);
  }

  @Patch(':organizationId/activate')
  @UseGuards(PlatformRolesGuard)
  @PlatformRoles('SUPER_ADMIN', 'PLATFORM_ADMIN')
  activateOrganization(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Body() dto: ActivateOrganizationDto,
  ) {
    return this.organizationsService.activateOrganization(actor, organizationId, dto);
  }

  @Post(':organizationId/first-admin-invitations')
  @UseGuards(PlatformRolesGuard)
  @PlatformRoles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'SALES')
  inviteFirstAdmin(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Body() dto: InviteFirstAdminDto,
  ) {
    return this.organizationsService.inviteFirstAdmin(actor, organizationId, dto);
  }

  @Get(':organizationId/members')
  listMembers(@CurrentActor() actor: RequestActor, @Param('organizationId') organizationId: string) {
    return this.organizationsService.listMembers(actor, organizationId);
  }

  @Post(':organizationId/members/invitations')
  inviteMember(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.organizationsService.inviteMember(actor, organizationId, dto);
  }

  @Patch(':organizationId/members/:membershipId/role')
  updateMemberRole(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(actor, organizationId, membershipId, dto);
  }

  @Delete(':organizationId/members/:membershipId')
  removeMember(
    @CurrentActor() actor: RequestActor,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.organizationsService.removeMember(actor, organizationId, membershipId);
  }
}
