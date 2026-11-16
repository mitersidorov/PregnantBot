import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
export class CreateCycleDto {
  @ApiProperty({ example: '2026-11-15' }) @IsDateString() startDate: string;
}
