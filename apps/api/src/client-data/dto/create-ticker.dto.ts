import { IsHexColor, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const TICKER_SPEEDS = ['Slow', 'Normal', 'Fast'] as const;
export const TICKER_PRIORITIES = ['Low', 'Normal', 'Urgent'] as const;
export const TICKER_STYLES = ['Classic', 'Neon', 'Gradient', 'Minimal'] as const;
export const TICKER_STATUSES = ['Active', 'Paused', 'Draft'] as const;

export class CreateTickerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsOptional()
  @IsIn(TICKER_SPEEDS as unknown as string[])
  speed?: (typeof TICKER_SPEEDS)[number];

  @IsOptional()
  @IsIn(TICKER_PRIORITIES as unknown as string[])
  priority?: (typeof TICKER_PRIORITIES)[number];

  @IsOptional()
  @IsIn(TICKER_STYLES as unknown as string[])
  style?: (typeof TICKER_STYLES)[number];

  @IsOptional()
  @IsIn(TICKER_STATUSES as unknown as string[])
  status?: (typeof TICKER_STATUSES)[number];

  @IsOptional()
  @IsHexColor()
  color?: string;
}
