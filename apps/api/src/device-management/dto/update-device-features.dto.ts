import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateDeviceFeaturesDto {
  @IsOptional()
  @IsBoolean()
  autoSync?: boolean;

  @IsOptional()
  @IsBoolean()
  offlinePlayback?: boolean;

  @IsOptional()
  @IsBoolean()
  proofOfPlay?: boolean;

  @IsOptional()
  @IsBoolean()
  ticker?: boolean;

  @IsOptional()
  @IsBoolean()
  watchdog?: boolean;

  @IsOptional()
  @IsBoolean()
  crashRecovery?: boolean;

  @IsOptional()
  @IsBoolean()
  backgroundSync?: boolean;

  @IsOptional()
  @IsBoolean()
  autoDownload?: boolean;

  @IsOptional()
  @IsBoolean()
  remoteLogs?: boolean;
}
