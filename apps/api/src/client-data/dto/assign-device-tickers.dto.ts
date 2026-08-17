import { IsArray, IsString } from 'class-validator';

export class AssignDeviceTickersDto {
  @IsArray()
  @IsString({ each: true })
  tickerIds!: string[];
}
