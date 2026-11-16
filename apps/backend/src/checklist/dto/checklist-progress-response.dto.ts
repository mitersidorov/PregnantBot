import { ApiProperty } from '@nestjs/swagger';

export class RequirementResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ enum: ['wife', 'husband', 'both'] }) patientApplicability: string;
  @ApiProperty({ nullable: true }) cycleDayHint: number | null;
  @ApiProperty({ nullable: true }) validityDays: number | null;
  @ApiProperty({ nullable: true, type: Object }) branchMetadata: Record<string, unknown> | null;
}

export class ChecklistProgressResponseDto {
  @ApiProperty({ format: 'uuid' }) cycleId: string;
  @ApiProperty({ format: 'uuid' }) requirementId: string;
  @ApiProperty({ enum: ['pending', 'complete', 'not_applicable'] }) status: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) resultId: string | null;
  @ApiProperty({ type: RequirementResponseDto }) requirement: RequirementResponseDto;
}
