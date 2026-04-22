import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class HeartbeatDto {
  @IsInt()
  @Min(0)
  @Max(100)
  cpu!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  ram!: number;

  @IsInt()
  @Min(0)
  @Max(120)
  temp!: number;

  @IsOptional()
  @IsString()
  currentContent?: string;
}
