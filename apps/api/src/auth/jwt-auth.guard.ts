import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestWithActor } from '../common/interfaces/request-with-actor.interface';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const authHeader = request.headers.authorization;
    const bearerHeader = typeof authHeader === 'string' ? authHeader : authHeader?.[0];

    if (!bearerHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = bearerHeader.replace('Bearer ', '').trim();
    const organizationIdHeader = request.headers['x-organization-id'];
    const organizationSlugHeader = request.headers['x-organization-slug'];
    request.actor = await this.authService.resolveActorFromToken(token, {
      organizationId: typeof organizationIdHeader === 'string' ? organizationIdHeader : undefined,
      organizationSlug: typeof organizationSlugHeader === 'string' ? organizationSlugHeader : undefined,
    });

    return true;
  }
}
