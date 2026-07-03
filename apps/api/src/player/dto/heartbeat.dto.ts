import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DevicePermissionsDto {
  @IsOptional()
  @IsBoolean()
  internet?: boolean;

  @IsOptional()
  @IsBoolean()
  storage?: boolean;

  @IsOptional()
  @IsBoolean()
  foregroundService?: boolean;

  @IsOptional()
  @IsBoolean()
  bootReceiver?: boolean;

  @IsOptional()
  @IsBoolean()
  wakeLock?: boolean;

  @IsOptional()
  @IsBoolean()
  notification?: boolean;

  @IsOptional()
  @IsBoolean()
  batteryOptimizationDisabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;

  @IsOptional()
  @IsBoolean()
  kioskMode?: boolean;
}

export class HeartbeatDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  cpu!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  ram!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  temp!: number;

  @IsOptional()
  @IsString()
  currentContent?: string;

  @IsOptional()
  @IsString()
  currentAsset?: string;

  @IsOptional()
  @IsString()
  currentPlaylistName?: string;

  @IsOptional()
  @IsString()
  playbackStatus?: string;

  /** Devices run 24/7 — must not use @IsInt() (rejects or truncates large values). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  playbackUptimeSeconds?: number;

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

  @IsOptional()
  @IsString()
  androidVersion?: string;

  @IsOptional()
  @IsString()
  playerVersion?: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  lastSyncTime?: string;

  /** Large Android storage values exceed Int32 — use @IsNumber(), persist as BigInt. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  storageTotalBytes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  storageFreeBytes?: number;

  @IsOptional()
  @IsString()
  networkStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100)
  @Max(0)
  wifiSignalStrength?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  brightness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  screenTimeoutSeconds?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DevicePermissionsDto)
  permissions?: DevicePermissionsDto;
}
