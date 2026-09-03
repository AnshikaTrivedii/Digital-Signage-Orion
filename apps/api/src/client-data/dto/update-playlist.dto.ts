import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}
