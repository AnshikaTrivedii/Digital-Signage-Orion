import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class BootstrapSuperAdminDto {
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;
}
