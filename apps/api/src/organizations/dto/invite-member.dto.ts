import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { OrganizationRole } from '@prisma/client';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  fullName!: string;

  @IsEnum(OrganizationRole)
  role!: OrganizationRole;

  @IsOptional()
  @IsString()
  message?: string;
}
