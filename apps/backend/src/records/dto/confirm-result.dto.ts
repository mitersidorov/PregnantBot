import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
