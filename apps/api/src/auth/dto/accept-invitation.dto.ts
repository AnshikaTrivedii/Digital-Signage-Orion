import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @MinLength(8)
  password!: string;
}
