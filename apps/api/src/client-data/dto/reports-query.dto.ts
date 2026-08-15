import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { NormalizeLimit, NormalizePage } from '../../common/transforms/normalize-pagination.transform';

export const REPORT_RANGES = ['today', 'yesterday', '7d', '15d', 'custom'] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

/** Calendar date `YYYY-MM-DD`, optionally with a time suffix. */
const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.+-Z]*)?$/;

export class ReportsQueryDto {
  @IsOptional()
  @IsIn(REPORT_RANGES)
  range?: ReportRange;

  /** Calendar date `YYYY-MM-DD` (preferred) or ISO datetime — day bounds applied in `timezone`. */
  @IsOptional()
  @Matches(REPORT_DATE_PATTERN, {
    message: 'startDate must be YYYY-MM-DD or an ISO datetime',
  })
  startDate?: string;

  /** Calendar date `YYYY-MM-DD` (preferred) or ISO datetime — day bounds applied in `timezone`. */
  @IsOptional()
  @Matches(REPORT_DATE_PATTERN, {
    message: 'endDate must be YYYY-MM-DD or an ISO datetime',
  })
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
  @NormalizePage(1)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @NormalizeLimit(100)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  /** IANA timezone for range bounds + export formatting, e.g. Asia/Kolkata */
  @IsOptional()
  @IsString()
  timezone?: string;

  /**
   * Viewer's calendar "today" as `YYYY-MM-DD` in `timezone`.
   * Anchors today/yesterday/7d/15d so a skewed API server clock cannot hide
   * the current local day's playback.
   */
  @IsOptional()
  @Matches(REPORT_DATE_PATTERN, {
    message: 'viewerDate must be YYYY-MM-DD or an ISO datetime',
  })
  viewerDate?: string;
}
