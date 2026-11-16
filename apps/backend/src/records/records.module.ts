import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3Module } from '../common/s3/s3.module';
import { ChecklistModule } from '../checklist/checklist.module';
import { Requirement } from '../checklist/entities/requirement.entity';
import { MedicalFile } from './entities/medical-file.entity';
import { MedicalResult } from './entities/medical-result.entity';
import { RecordsController } from './controllers/records.controller';
import { InterpretationService } from './services/interpretation.service';
import { RecordsService } from './services/records.service';

// Provides protected document, result proposal, confirmation, and download APIs.
@Module({
  imports: [TypeOrmModule.forFeature([MedicalFile, MedicalResult, Requirement]), ChecklistModule, S3Module],
  controllers: [RecordsController],
  providers: [RecordsService, InterpretationService],
})
export class RecordsModule {}
