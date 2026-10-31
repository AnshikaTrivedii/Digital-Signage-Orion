import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, ValidateNested } from 'class-validator';
import { LAYOUT_RESOLUTIONS } from './create-layout.dto';
import { LayoutZoneDto } from './layout-zone.dto';

export class SaveLayoutZonesDto {
  @IsOptional()
  @IsIn(LAYOUT_RESOLUTIONS as unknown as string[])
  resolution?: (typeof LAYOUT_RESOLUTIONS)[number];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutZoneDto)
  zones!: LayoutZoneDto[];
}
