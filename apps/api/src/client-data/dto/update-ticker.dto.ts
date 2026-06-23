import { IsArray, IsHexColor, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  TICKER_BROADCAST_SCOPES,
  TICKER_POSITIONS,
  TICKER_PRIORITIES,
  TICKER_SPEEDS,
  TICKER_STATUSES,
  TICKER_STYLES,
} from './create-ticker.dto';

export class UpdateTickerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text?: string;

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

  @IsOptional()
  @IsHexColor()
  backgroundColor?: string;

  @IsOptional()
  @IsIn(TICKER_POSITIONS as unknown as string[])
  position?: (typeof TICKER_POSITIONS)[number];

  @IsOptional()
  @IsIn(TICKER_BROADCAST_SCOPES as unknown as string[])
  broadcastScope?: (typeof TICKER_BROADCAST_SCOPES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deviceIds?: string[];
}
