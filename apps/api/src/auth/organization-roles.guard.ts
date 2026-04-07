import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ORGANIZATION_ROLES_KEY } from '../common/decorators/organization-roles.decorator';
import type { OrganizationRoleValue } from '../common/constants/access';
import type { RequestWithActor } from '../common/interfaces/request-with-actor.interface';

@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<OrganizationRoleValue[]>(ORGANIZATION_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = request.actor;

    if (actor?.platformRole === 'SUPER_ADMIN' || actor?.platformRole === 'PLATFORM_ADMIN') {
      return true;
    }

    if (actor?.organization && roles.includes(actor.organization.role)) {
      return true;
    }

    throw new ForbiddenException('Organization role not permitted');
  }
}
