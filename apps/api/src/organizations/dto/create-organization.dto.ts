import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsOptional()
  @IsString()
  primaryContactName?: string;

  @IsOptional()
  @IsEmail()
  primaryContactEmail?: string;

  @IsOptional()
  @IsString()
  salesNotes?: string;

  /** Max devices the organization may have. Omit for unlimited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  deviceLimit?: number;
}
