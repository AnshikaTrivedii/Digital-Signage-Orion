import { IsOptional, IsString } from 'class-validator';

export class ActivateOrganizationDto {
  @IsOptional()
  @IsString()
  activationNote?: string;
}
