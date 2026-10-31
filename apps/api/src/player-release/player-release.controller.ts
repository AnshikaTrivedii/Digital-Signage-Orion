import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/platform-roles.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { PlatformRoles } from '../common/decorators/platform-roles.decorator';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PlayerReleaseService } from './player-release.service';

class CreatePlayerReleaseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200 * 1024 * 1024)
  sizeBytes!: number;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  sha256!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

@Controller('platform/player-releases')
@UseGuards(JwtAuthGuard, PlatformRolesGuard)
export class PlayerReleaseController {
  constructor(private readonly releases: PlayerReleaseService) {}

  @Get()
  @PlatformRoles('SUPER_ADMIN', 'PLATFORM_ADMIN')
  list() {
    return this.releases.list();
  }

  @Post()
  @PlatformRoles('SUPER_ADMIN')
  create(@CurrentActor() actor: RequestActor, @Body() body: CreatePlayerReleaseDto) {
    return this.releases.createDraft(actor.userId, Number(body.sizeBytes), body.sha256, body.notes);
  }

  @Put(':id/apk')
  @PlatformRoles('SUPER_ADMIN')
  async upload(@Param('id') id: string, @Req() request: Request) {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > 200 * 1024 * 1024) throw new BadRequestException('APK exceeds 200 MB');
      chunks.push(buffer);
    }
    return this.releases.localUpload(id, Buffer.concat(chunks));
  }

  @Post(':id/confirm')
  @PlatformRoles('SUPER_ADMIN')
  confirm(@Param('id') id: string, @CurrentActor() actor: RequestActor) {
    return this.releases.confirm(id, actor.userId);
  }

  @Patch(':id/activate')
  @PlatformRoles('SUPER_ADMIN')
  activate(@Param('id') id: string, @CurrentActor() actor: RequestActor) {
    return this.releases.activate(id, actor.userId);
  }

  @Patch(':id/deactivate')
  @PlatformRoles('SUPER_ADMIN')
  deactivate(@Param('id') id: string, @CurrentActor() actor: RequestActor) {
    return this.releases.deactivate(id, actor.userId);
  }
}
