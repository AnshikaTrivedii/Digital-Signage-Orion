import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsNotEmpty, MinLength, ValidateNested } from 'class-validator';
import { SharedFeaturePermissionDto } from './shared-feature-permission.dto';

export class CreateMemberDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  fullName!: string;

  @MinLength(8)
  password!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedFeaturePermissionDto)
  permissions!: SharedFeaturePermissionDto[];
}
