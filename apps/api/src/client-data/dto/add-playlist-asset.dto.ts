import { Allow, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class AddPlaylistAssetDto {
  @IsString()
  assetId!: string;

  /** Omit or null = blank duration (device default). Never auto-fill 10. */
  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  durationSeconds?: number | null;
}
