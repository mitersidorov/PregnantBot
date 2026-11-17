import { ApiProperty } from '@nestjs/swagger';
import type { ChecklistMatchedFinding, ExtractedFinding } from '../types/extracted-finding.interface';

export class LinkedRequirementResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class MedicalResultResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) fileId: string;
  @ApiProperty({ example: 1 }) versionNumber: number;
  @ApiProperty({ nullable: true }) testName: string | null;
  @ApiProperty({ nullable: true, format: 'date' }) resultDate: string | null;
  @ApiProperty({ nullable: true }) summary: string | null;
  @ApiProperty({ type: 'array', items: { type: 'object' }, nullable: true }) extractedFindings:
    ExtractedFinding[] | null;
  @ApiProperty({ type: 'array', items: { type: 'object' }, required: false })
  matchedFindings?: ChecklistMatchedFinding[];
  @ApiProperty({ nullable: true, enum: ['normal', 'abnormal'] }) normality: 'normal' | 'abnormal' | null;
  @ApiProperty({ enum: ['pending', 'proposed', 'confirmed'] }) interpretationStatus: string;
  @ApiProperty({
    type: [LinkedRequirementResponseDto],
    description: 'Explicitly confirmed links; empty for unclassified results.',
  })
  requirements: LinkedRequirementResponseDto[];
  @ApiProperty({ nullable: true, format: 'uuid' }) supersededBy: string | null;
}

export class MedicalFileResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '101', description: 'Authenticated Telegram user ID that uploaded this file.' })
  uploadedBy: string;
  @ApiProperty({ example: 'result.pdf' }) originalName: string;
  @ApiProperty({ enum: ['application/pdf', 'image/jpeg', 'image/png'] }) contentType: string;
  @ApiProperty({ example: 1024 }) byteSize: number;
  @ApiProperty({ format: 'date-time' }) uploadedAt: Date;
  @ApiProperty({ type: [MedicalResultResponseDto] }) results: MedicalResultResponseDto[];
}

export class UploadResponseDto {
  @ApiProperty({ type: MedicalFileResponseDto }) file: MedicalFileResponseDto;
  @ApiProperty({ type: MedicalResultResponseDto }) result: MedicalResultResponseDto;
}
