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

export const SCHEDULE_STATUSES = ['scheduled', 'active', 'paused', 'completed'] as const;
export const SCHEDULE_PRIORITIES = ['low', 'normal', 'high'] as const;
export const SCHEDULE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateScheduleEventDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    campaign?: string;

    @IsString()
    @Matches(TIME_REGEX, { message: 'startTime must be HH:MM (24h)' })
    startTime!: string;

    @IsString()
    @Matches(TIME_REGEX, { message: 'endTime must be HH:MM (24h)' })
    endTime!: string;

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMinSize(1)
    @IsIn(SCHEDULE_DAYS as unknown as string[], { each: true })
    days!: string[];

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
