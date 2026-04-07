import { IsEmail, IsEnum, IsNotEmpty, MinLength } from 'class-validator';
import { PlatformRole } from '@prisma/client';

export class CreatePlatformUserDto {
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsEnum(PlatformRole)
  platformRole!: PlatformRole;

  @MinLength(8)
  password!: string;
}
