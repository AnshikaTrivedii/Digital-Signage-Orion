import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  resolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  os?: string;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ip?: string;
}
