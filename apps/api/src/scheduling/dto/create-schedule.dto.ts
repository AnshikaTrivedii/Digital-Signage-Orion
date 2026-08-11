import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** `YYYY-MM-DD` calendar date as typed by the operator. */
export const SCHEDULE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** `HH:MM` 24-hour wall-clock time as typed by the operator. */
export const SCHEDULE_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Dates and times arrive as separate wall-clock fields, never as ISO instants.
 * The service converts them using the organization timezone, so the operator's
 * "09:00" always means 09:00 to them regardless of where the server runs.
 */
export class CreateScheduleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  playlistId!: string;

  /** Omit or send null to target every device in the organization. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  deviceId?: string | null;

  @IsString()
  @Matches(SCHEDULE_DATE_REGEX, { message: 'startDate must be YYYY-MM-DD' })
  startDate!: string;

  @IsString()
  @Matches(SCHEDULE_TIME_REGEX, { message: 'startTime must be HH:MM (24h)' })
  startTime!: string;

  @IsString()
  @Matches(SCHEDULE_DATE_REGEX, { message: 'endDate must be YYYY-MM-DD' })
  endDate!: string;

  @IsString()
  @Matches(SCHEDULE_TIME_REGEX, { message: 'endTime must be HH:MM (24h)' })
  endTime!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  enabled?: boolean;
}
