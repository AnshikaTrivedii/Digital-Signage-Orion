import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { HeartbeatDto } from './heartbeat.dto';

export class SystemLogEntryDto {
  @IsString()
  category!: string;

  @IsString()
  message!: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class SubmitSystemLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SystemLogEntryDto)
  logs!: SystemLogEntryDto[];
}

export class DeviceReportDto extends HeartbeatDto {
  @IsOptional()
  @IsString()
  screenshotUrl?: string;

  @IsOptional()
  @IsString()
  completedCommandId?: string;

  @IsOptional()
  commandFailed?: boolean;

  @IsOptional()
  @IsString()
  commandError?: string;
}
