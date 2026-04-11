import { FeatureAccessLevel, FeatureKey } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SharedFeaturePermissionDto {
  @IsEnum(FeatureKey)
  featureKey!: FeatureKey;

  @IsEnum(FeatureAccessLevel)
  accessLevel!: FeatureAccessLevel;
}
