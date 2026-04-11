import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateAssetTagsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags!: string[];
}
