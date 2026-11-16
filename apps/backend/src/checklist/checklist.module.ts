import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cycle } from '../cycles/entities/cycle.entity';
import { MedicalResult } from '../records/entities/medical-result.entity';
import { ChecklistProgress } from './entities/checklist-progress.entity';
import { Requirement } from './entities/requirement.entity';
import { ChecklistController } from './controllers/checklist.controller';
import { ChecklistService } from './services/checklist.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cycle, Requirement, ChecklistProgress, MedicalResult])],
  controllers: [ChecklistController],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
