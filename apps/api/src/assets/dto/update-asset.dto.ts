import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  // `null` moves the asset to the root (unfiled). Omit the field to leave it unchanged.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  folderId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  defaultDurationSeconds?: number;
}
