import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

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

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  folderId?: string | null;
}
