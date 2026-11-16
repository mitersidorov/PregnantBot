import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Requirement } from '../../checklist/entities/requirement.entity';
import { MedicalFile } from './medical-file.entity';

@Entity('medical_results')
export class MedicalResult {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'file_id', type: 'char', length: 36 }) fileId: string;
  @Column({ name: 'version_number', type: 'int' }) versionNumber: number;
  @Column({ name: 'test_name', type: 'varchar', length: 255, nullable: true }) testName: string | null;
  @Column({ name: 'result_date', type: 'date', nullable: true }) resultDate: string | null;
  @Column({ type: 'text', nullable: true }) summary: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) normality: 'normal' | 'abnormal' | null;
  @Column({ name: 'interpretation_status', type: 'varchar', length: 20, default: 'proposed' })
  interpretationStatus: string;
  @Column({ name: 'model_version', type: 'varchar', length: 80, nullable: true }) modelVersion: string | null;
  @Column({ name: 'prompt_version', type: 'varchar', length: 40, nullable: true }) promptVersion: string | null;
  @Column({ name: 'schema_version', type: 'varchar', length: 40, default: '1' }) schemaVersion: string;
  @Column({ name: 'superseded_by', type: 'char', length: 36, nullable: true }) supersededBy: string | null;
  @ManyToOne(() => MedicalFile, (file) => file.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: Relation<MedicalFile>;
  @ManyToMany(() => Requirement)
  @JoinTable({
    name: 'medical_result_requirements',
    joinColumn: { name: 'result_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'requirement_id', referencedColumnName: 'id' },
  })
  requirements: Requirement[];
}
