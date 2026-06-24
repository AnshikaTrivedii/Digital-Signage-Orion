import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddPlaylistAssetDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSeconds?: number;
}
