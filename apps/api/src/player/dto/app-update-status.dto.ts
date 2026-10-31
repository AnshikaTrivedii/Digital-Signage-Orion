import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AppUpdateStatusDto {
  @IsString()
  releaseId!: string;

  @IsIn(['AVAILABLE', 'DOWNLOADING', 'VERIFIED', 'INSTALLING', 'HEALTHY', 'FAILED', 'BLOCKED'])
  state!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  retryCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  installedVersionCode?: number;
}
