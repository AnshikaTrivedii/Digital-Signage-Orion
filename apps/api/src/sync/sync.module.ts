import { Global, Module } from '@nestjs/common';
import { DeviceCacheModule } from '../device-cache/device-cache.module';
import { PlaylistSyncService } from './playlist-sync.service';

@Global()
@Module({
  imports: [DeviceCacheModule],
  providers: [PlaylistSyncService],
  exports: [PlaylistSyncService],
})
export class SyncModule {}
