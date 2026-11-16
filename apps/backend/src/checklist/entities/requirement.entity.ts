import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('requirements')
export class Requirement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 160 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'patient_applicability', type: 'varchar', length: 20, default: 'both' }) patientApplicability: string;
  @Column({ name: 'cycle_day_hint', type: 'int', nullable: true }) cycleDayHint: number | null;
  @Column({ name: 'validity_days', type: 'int', nullable: true }) validityDays: number | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ name: 'branch_metadata', type: 'json', nullable: true }) branchMetadata: Record<string, unknown> | null;
}
