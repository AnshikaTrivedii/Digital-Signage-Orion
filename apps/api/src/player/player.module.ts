import { Module } from '@nestjs/common';
import { DeviceCacheModule } from '../device-cache/device-cache.module';
import { DeviceManagementModule } from '../device-management/device-management.module';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [PrismaModule, S3Module, DeviceCacheModule, DeviceManagementModule, SchedulingModule],
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
