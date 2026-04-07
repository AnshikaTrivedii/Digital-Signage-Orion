import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditEntry = {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        organizationId: entry.organizationId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        summary: entry.summary,
        metadata: entry.metadata,
      },
    });
  }
}
