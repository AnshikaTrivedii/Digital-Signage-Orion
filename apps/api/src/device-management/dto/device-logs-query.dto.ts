import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DeviceSystemLogCategory } from '@prisma/client';
import { NormalizeLimit } from '../../common/transforms/normalize-pagination.transform';

export const DEFAULT_DEVICE_LOGS_LIMIT = 100;

export class DeviceLogsQueryDto {
  @IsOptional()
  @IsEnum(DeviceSystemLogCategory)
  category?: DeviceSystemLogCategory;

  @IsOptional()
  @NormalizeLimit(DEFAULT_DEVICE_LOGS_LIMIT)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = DEFAULT_DEVICE_LOGS_LIMIT;
}
