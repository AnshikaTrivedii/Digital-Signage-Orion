import { IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export const ZONE_TYPES = ['Playlist', 'Ticker', 'Image', 'Html', 'Clock'] as const;

export class LayoutZoneDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(ZONE_TYPES as unknown as string[])
  type!: (typeof ZONE_TYPES)[number];

  @IsNumber()
  @Min(0)
  @Max(100)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y!: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  w!: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  h!: number;

  @IsOptional()
  @IsNumber()
  zIndex?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  playlistId?: string | null;

  @IsOptional()
  @IsString()
  assetId?: string | null;
}
