import { IsArray, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateAssetDto {
  // `null` moves the asset to the root (unfiled). Omit the field to leave it unchanged.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  folderId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
