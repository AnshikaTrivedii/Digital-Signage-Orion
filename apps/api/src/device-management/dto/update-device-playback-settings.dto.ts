import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_IMAGE_DURATION_SECONDS = 10;
export const DEFAULT_DOCUMENT_DURATION_SECONDS = 20;
export const DEFAULT_URL_DURATION_SECONDS = 20;
export const MIN_PLAYBACK_DURATION_SECONDS = 1;
export const MAX_PLAYBACK_DURATION_SECONDS = 600;

export class UpdateDevicePlaybackSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PLAYBACK_DURATION_SECONDS)
  @Max(MAX_PLAYBACK_DURATION_SECONDS)
  imageDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PLAYBACK_DURATION_SECONDS)
  @Max(MAX_PLAYBACK_DURATION_SECONDS)
  documentDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PLAYBACK_DURATION_SECONDS)
  @Max(MAX_PLAYBACK_DURATION_SECONDS)
  urlDuration?: number;
}
