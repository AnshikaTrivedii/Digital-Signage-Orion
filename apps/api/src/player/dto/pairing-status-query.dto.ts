import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PairingStatusQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  pairingSecret!: string;
}
