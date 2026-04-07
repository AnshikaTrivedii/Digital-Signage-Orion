import { ConflictException, Injectable } from '@nestjs/common';
import { PlatformRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createPlatformUser(actor: RequestActor, dto: CreatePlatformUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('User already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        passwordHash,
        platformRole: dto.platformRole,
        status: UserStatus.ACTIVE,
      },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      action: 'platform_user.created',
      targetType: 'user',
      targetId: user.id,
      summary: `${actor.email} created internal user ${user.email} with role ${dto.platformRole}`,
      metadata: { platformRole: dto.platformRole },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      platformRole: user.platformRole,
      status: user.status,
    };
  }

  async listPlatformUsers() {
    return this.prisma.user.findMany({
      where: {
        platformRole: {
          in: [PlatformRole.SUPER_ADMIN, PlatformRole.PLATFORM_ADMIN, PlatformRole.SALES, PlatformRole.SUPPORT],
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        platformRole: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
