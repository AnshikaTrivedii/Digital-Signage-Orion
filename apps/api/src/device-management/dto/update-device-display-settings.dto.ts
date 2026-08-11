import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateDeviceDisplaySettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['LANDSCAPE', 'PORTRAIT'])
  orientation?: 'LANDSCAPE' | 'PORTRAIT';

  @IsOptional()
  @IsBoolean()
  stretchToFit?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  defaultImageDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  defaultVideoDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  defaultDocumentDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  defaultUrlDuration?: number;
}
