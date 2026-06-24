import { IsInt, Min } from 'class-validator';

export class UpdatePlaylistAssetDurationDto {
  @IsInt()
  @Min(1)
  durationSeconds!: number;
}
