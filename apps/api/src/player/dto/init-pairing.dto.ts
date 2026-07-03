import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class InitPairingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  hardwareId!: string;

  @IsOptional()
  @IsString()
  androidVersion?: string;

  @IsOptional()
  @IsString()
  playerVersion?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsString()
  macAddress?: string;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsString()
  orientation?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
