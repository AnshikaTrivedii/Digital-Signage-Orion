import { IsArray, IsString } from 'class-validator';

export class AssignLayoutDto {
  @IsArray()
  @IsString({ each: true })
  deviceIds!: string[];
}
