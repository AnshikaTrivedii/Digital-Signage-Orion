import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { SharedFeaturePermissionDto } from './shared-feature-permission.dto';

export class UpdateMemberPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedFeaturePermissionDto)
  permissions!: SharedFeaturePermissionDto[];
}
