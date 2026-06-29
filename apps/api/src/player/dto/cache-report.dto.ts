import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CacheReportAssetDto {
  @IsString()
  assetId!: string;

  @IsString()
  assetName!: string;

  @IsString()
  assetType!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  playlistId?: string;

  @IsOptional()
  @IsString()
  playlistName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  assetVersion?: number;

  @IsOptional()
  @IsString()
  contentHash?: string;

  @IsString()
  downloadStatus!: string;

  @IsString()
  localCacheStatus!: string;

  @IsOptional()
  @IsISO8601()
  downloadedAt?: string;
}

export class CacheReportDto {
  @IsOptional()
  @IsString()
  currentPlaylistId?: string;

  @IsOptional()
  @IsString()
  currentPlaylistName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  playlistVersion?: number;

  @IsOptional()
  @IsString()
  currentLayoutId?: string;

  @IsOptional()
  @IsString()
  currentLayoutName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  layoutVersion?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cacheTotalBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cacheUsedBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  storageTotalBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cachedAssetCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedAssetCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pendingDownloadCount?: number;

  @IsOptional()
  @IsString()
  syncStatus?: string;

  @IsOptional()
  @IsISO8601()
  lastSuccessfulSyncAt?: string;

  @IsOptional()
  @IsISO8601()
  lastFailedSyncAt?: string;

  @IsOptional()
  @IsString()
  lastSyncError?: string;

  @IsOptional()
  @IsString()
  completedCommandId?: string;

  @IsOptional()
  @IsBoolean()
  commandFailed?: boolean;

  @IsOptional()
  @IsString()
  commandError?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CacheReportAssetDto)
  assets!: CacheReportAssetDto[];
}
