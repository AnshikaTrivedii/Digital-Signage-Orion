import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class RequestUploadDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(524_288_000) // 500 MB
  fileSize!: number;
}
