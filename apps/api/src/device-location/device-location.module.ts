import { Module } from '@nestjs/common';
import { DeviceManagementModule } from '../device-management/device-management.module';
import { DeviceLocationService } from './device-location.service';

@Module({
  imports: [DeviceManagementModule],
  providers: [DeviceLocationService],
  exports: [DeviceLocationService],
})
export class DeviceLocationModule {}
