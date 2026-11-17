import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConfirmResultFindingDto {
  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  testName: string | null;

  @ApiProperty({ nullable: true, format: 'date' })
  @IsOptional()
  @IsDateString()
  resultDate: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary: string | null;

  @ApiProperty({ nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber: number | null;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirementIds?: string[];
}

export class ConfirmResultDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(255) testName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() resultDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(2000) summary?: string;
  @ApiProperty({
    required: false,
    enum: ['normal', 'abnormal'],
    description: 'Explicit user-confirmed semen analysis status.',
  })
  @IsOptional()
  @IsIn(['normal', 'abnormal'])
  normality?: 'normal' | 'abnormal';
  @ApiProperty({
    type: [String],
    minItems: 1,
    description: 'At least one checklist requirement ID explicitly confirmed by the user.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  requirementIds: string[];

  @ApiProperty({ type: [ConfirmResultFindingDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmResultFindingDto)
  extractedFindings?: ConfirmResultFindingDto[];
}
