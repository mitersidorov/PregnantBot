import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { ChecklistProgress } from '../../checklist/entities/checklist-progress.entity';

@Entity('cycles')
export class Cycle {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'started_by', type: 'varchar', length: 32 }) startedBy: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ type: 'varchar', length: 20, default: 'active' }) status: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToMany(() => ChecklistProgress, (progress) => progress.cycle) checklist: Relation<ChecklistProgress[]>;
}
