import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateUrlAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  // require_tld: false so IP hosts (http://65.1.81.209/stations) validate.
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSeconds?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  folderId?: string | null;
}
