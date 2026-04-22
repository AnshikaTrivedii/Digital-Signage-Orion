import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsString, ValidateNested } from 'class-validator';

enum PopStatus {
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

class PopLogEntry {
  @IsString()
  content!: string;

  @IsEnum(PopStatus)
  status!: PopStatus;

  @IsDateString()
  timestamp!: string;
}

export class SubmitPopLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PopLogEntry)
  logs!: PopLogEntry[];
}
