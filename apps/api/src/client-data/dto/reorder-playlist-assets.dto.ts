import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderPlaylistAssetsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  assetIds!: string[];
}
