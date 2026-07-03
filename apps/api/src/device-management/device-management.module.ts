import { Module } from '@nestjs/common';
import { DeviceCacheModule } from '../device-cache/device-cache.module';
import { DeviceManagementService } from './device-management.service';

@Module({
  imports: [DeviceCacheModule],
  providers: [DeviceManagementService],
  exports: [DeviceManagementService],
})
export class DeviceManagementModule {}
