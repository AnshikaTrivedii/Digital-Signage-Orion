import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class PairDeviceDto {
  @IsString()
  @Length(6, 6, { message: 'Pairing code must be exactly 6 characters' })
  pairingCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
