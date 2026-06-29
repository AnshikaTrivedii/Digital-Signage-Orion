import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export const REPORT_RANGES = ['today', '7d', '30d', 'all', 'custom'] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export class ReportsQueryDto {
  @IsOptional()
  @IsIn(REPORT_RANGES)
  range?: ReportRange;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'verified', 'failed'])
  status?: 'all' | 'verified' | 'failed';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  /** IANA timezone for export formatting, e.g. Asia/Kolkata */
  @IsOptional()
  @IsString()
  timezone?: string;
}
