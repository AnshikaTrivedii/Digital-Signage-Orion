import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderPlaylistAssetsDto {
  /** Ordered PlaylistAsset row ids (not Asset ids) so duplicate assets reorder correctly. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  playlistAssetIds!: string[];
}
