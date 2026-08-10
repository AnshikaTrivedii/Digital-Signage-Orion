import { Allow, IsInt, Min, ValidateIf } from 'class-validator';

export class UpdatePlaylistAssetDurationDto {
  /** null clears the playlist override (use device default). Never coerce to 10. */
  @Allow()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  durationSeconds!: number | null;
}
