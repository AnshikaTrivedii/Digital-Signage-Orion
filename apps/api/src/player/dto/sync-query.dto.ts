import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SyncQueryDto {
  /** Last layoutVersion the player successfully cached */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  layoutVersion?: number;

  /** Last playlistVersion the player successfully cached */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  playlistVersion?: number;

  /** Comma-separated asset IDs the player currently has on disk */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  knownAssetIds?: string;

  /**
   * Comma-separated assetId:contentVersion pairs for delta downloads.
   * Example: "abc123:1,def456:3"
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  assetVersions?: string;

  /** Force presigned download URLs even when playlist/layout version is unchanged (cache recovery). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  recoverCache?: boolean;

  /** Comma-separated asset IDs the player knows it is missing locally — always returns download URLs for these. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  missingAssetIds?: string;
}
