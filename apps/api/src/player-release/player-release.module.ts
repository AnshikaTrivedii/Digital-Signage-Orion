import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PlayerReleaseController } from './player-release.controller';
import { PlayerReleaseService } from './player-release.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PlayerReleaseController],
  providers: [PlayerReleaseService],
  exports: [PlayerReleaseService],
})
export class PlayerReleaseModule {}
