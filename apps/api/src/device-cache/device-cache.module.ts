import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceCacheService } from './device-cache.service';

@Module({
  imports: [PrismaModule],
  providers: [DeviceCacheService],
  exports: [DeviceCacheService],
})
export class DeviceCacheModule {}
