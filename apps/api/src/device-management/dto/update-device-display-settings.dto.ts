import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDeviceDisplaySettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['LANDSCAPE', 'PORTRAIT'])
  orientation?: 'LANDSCAPE' | 'PORTRAIT';

  @IsOptional()
  @IsBoolean()
  stretchToFit?: boolean;
}
