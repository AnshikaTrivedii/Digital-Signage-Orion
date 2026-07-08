import {
    ArrayMinSize,
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsHexColor,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

import {
    SCHEDULE_DAYS,
    SCHEDULE_PRIORITIES,
    SCHEDULE_STATUSES,
} from './create-schedule-event.dto';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateScheduleEventDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    campaign?: string;

    @IsOptional()
    @IsString()
    @Matches(TIME_REGEX, { message: 'startTime must be HH:MM (24h)' })
    startTime?: string;

    @IsOptional()
    @IsString()
    @Matches(TIME_REGEX, { message: 'endTime must be HH:MM (24h)' })
    endTime?: string;

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMinSize(1)
    @IsIn(SCHEDULE_DAYS as unknown as string[], { each: true })
    days?: string[];

    @IsOptional()
    @IsInt()
    @Min(0)
    screens?: number;

    @IsOptional()
    @IsIn(SCHEDULE_STATUSES as unknown as string[])
    status?: (typeof SCHEDULE_STATUSES)[number];

    @IsOptional()
    @IsIn(SCHEDULE_PRIORITIES as unknown as string[])
    priority?: (typeof SCHEDULE_PRIORITIES)[number];

    @IsOptional()
    @IsBoolean()
    recurring?: boolean;

    @IsOptional()
    @IsHexColor()
    color?: string;
}
