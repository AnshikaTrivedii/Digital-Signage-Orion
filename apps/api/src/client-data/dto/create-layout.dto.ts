import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const LAYOUT_RESOLUTIONS = ['Landscape 1080p', 'Landscape 4K', 'Portrait'] as const;

export class CreateLayoutDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsIn(LAYOUT_RESOLUTIONS as unknown as string[])
  resolution?: (typeof LAYOUT_RESOLUTIONS)[number];
}
