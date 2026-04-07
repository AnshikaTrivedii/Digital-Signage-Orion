import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_ROLES_KEY } from '../common/decorators/platform-roles.decorator';
import type { PlatformRoleValue } from '../common/constants/access';
import type { RequestWithActor } from '../common/interfaces/request-with-actor.interface';

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<PlatformRoleValue[]>(PLATFORM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    if (request.actor?.platformRole && roles.includes(request.actor.platformRole)) {
      return true;
    }

    throw new ForbiddenException('Platform role not permitted');
  }
}
