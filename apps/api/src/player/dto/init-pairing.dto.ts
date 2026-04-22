import { IsString, MinLength, MaxLength } from 'class-validator';

export class InitPairingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  hardwareId!: string;
}
