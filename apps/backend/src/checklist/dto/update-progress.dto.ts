import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
export class UpdateProgressDto {
  @ApiProperty({ enum: ['pending', 'complete', 'not_applicable'] })
  @IsIn(['pending', 'complete', 'not_applicable'])
  status: string;
}
