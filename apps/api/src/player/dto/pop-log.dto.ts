import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

enum PopStatus {
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

function normalizePopTimestamp(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

class PopLogEntry {
  @IsOptional()
  @IsString()
  assetName?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  playlistName?: string;

  /** Playlist that was playing when the asset started (preferred over server "now"). */
  @IsOptional()
  @IsString()
  playlistId?: string;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const upper = value.trim().toUpperCase();
    return upper === 'VERIFIED' || upper === 'FAILED' ? upper : value;
  })
  @IsEnum(PopStatus)
  status!: PopStatus;

  @IsOptional()
  @Transform(({ value }) => normalizePopTimestamp(value))
  @IsString()
  startTime?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePopTimestamp(value))
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSeconds?: number;

  /** @deprecated Use startTime */
  @IsOptional()
  @Transform(({ value }) => normalizePopTimestamp(value))
  @IsString()
  timestamp?: string;
}

export class SubmitPopLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PopLogEntry)
  logs!: PopLogEntry[];
}

export type PopLogInput = PopLogEntry;
