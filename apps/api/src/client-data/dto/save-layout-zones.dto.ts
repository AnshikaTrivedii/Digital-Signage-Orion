import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { LayoutZoneDto } from './layout-zone.dto';

export class SaveLayoutZonesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutZoneDto)
  zones!: LayoutZoneDto[];
}
