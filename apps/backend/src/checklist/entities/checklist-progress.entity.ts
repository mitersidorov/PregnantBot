import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Cycle } from '../../cycles/entities/cycle.entity';
import { Requirement } from './requirement.entity';
import { MedicalResult } from '../../records/entities/medical-result.entity';

@Entity('checklist_progress')
export class ChecklistProgress {
  @PrimaryColumn({ name: 'cycle_id', type: 'char', length: 36 }) cycleId: string;
  @PrimaryColumn({ name: 'requirement_id', type: 'char', length: 36 }) requirementId: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' }) status: string;
  @Column({ name: 'result_id', type: 'char', length: 36, nullable: true }) resultId: string | null;
  @ManyToOne(() => Cycle, (cycle) => cycle.checklist, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycle_id' })
  cycle: Relation<Cycle>;
  @ManyToOne(() => Requirement, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requirement_id' })
  requirement: Relation<Requirement>;
  @ManyToOne(() => MedicalResult, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'result_id' })
  result: Relation<MedicalResult> | null;
}
