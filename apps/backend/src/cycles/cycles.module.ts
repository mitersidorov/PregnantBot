import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistModule } from '../checklist/checklist.module';
import { Cycle } from './entities/cycle.entity';
import { CyclesService } from './services/cycles.service';
import { CyclesController } from './controllers/cycles.controller';

// Provides protected cycle, checklist, upload, result, and confirmation APIs.
@Module({
  imports: [TypeOrmModule.forFeature([Cycle]), ChecklistModule],
  controllers: [CyclesController],
  providers: [CyclesService],
})
export class CyclesModule {}
