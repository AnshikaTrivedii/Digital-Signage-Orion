import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InviteFirstAdminDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  message?: string;
}
