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

import { SCHEDULE_DATE_REGEX, SCHEDULE_TIME_REGEX } from './create-schedule.dto';

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  playlistId?: string;

  /** Explicit null retargets the schedule at every device. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  deviceId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(SCHEDULE_DATE_REGEX, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(SCHEDULE_TIME_REGEX, { message: 'startTime must be HH:MM (24h)' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(SCHEDULE_DATE_REGEX, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  @IsOptional()
  @IsString()
  @Matches(SCHEDULE_TIME_REGEX, { message: 'endTime must be HH:MM (24h)' })
  endTime?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  enabled?: boolean;
}
