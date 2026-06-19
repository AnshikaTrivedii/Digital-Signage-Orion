import { Global, Module } from '@nestjs/common';
import { PlaylistSyncService } from './playlist-sync.service';

@Global()
@Module({
  providers: [PlaylistSyncService],
  exports: [PlaylistSyncService],
})
export class SyncModule {}
