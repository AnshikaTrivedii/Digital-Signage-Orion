import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { LAYOUT_RESOLUTIONS } from './create-layout.dto';

export const LAYOUT_STATUSES = ['Draft', 'Active'] as const;

export class UpdateLayoutDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(LAYOUT_RESOLUTIONS as unknown as string[])
  resolution?: (typeof LAYOUT_RESOLUTIONS)[number];

  @IsOptional()
  @IsIn(LAYOUT_STATUSES as unknown as string[])
  status?: (typeof LAYOUT_STATUSES)[number];
}
