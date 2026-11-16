import { ApiProperty } from '@nestjs/swagger';
import { ChecklistProgressResponseDto } from '../../checklist/dto/checklist-progress-response.dto';

export { ChecklistProgressResponseDto } from '../../checklist/dto/checklist-progress-response.dto';

export class CycleResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '2026-11-15', format: 'date' }) startDate: string;
  @ApiProperty({ example: '123456789' }) startedBy: string;
  @ApiProperty({ enum: ['active', 'completed'] }) status: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: [ChecklistProgressResponseDto] }) checklist: ChecklistProgressResponseDto[];
}
