import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DeviceSystemLogCategory } from '@prisma/client';

export class DeviceLogsQueryDto {
  @IsOptional()
  @IsEnum(DeviceSystemLogCategory)
  category?: DeviceSystemLogCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
