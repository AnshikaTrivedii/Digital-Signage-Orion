import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderCampaignAssetsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  assetIds!: string[];
}
