import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  primaryContactName?: string;

  @IsOptional()
  @IsEmail()
  primaryContactEmail?: string;

  @IsOptional()
  @IsString()
  salesNotes?: string;

  /** Max devices the organization may have. Send `null` to allow unlimited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  deviceLimit?: number | null;
}
