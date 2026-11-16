import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { MedicalResult } from './medical-result.entity';

@Entity('medical_files')
export class MedicalFile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'uploaded_by', type: 'varchar', length: 32 }) uploadedBy: string;
  @Column({ name: 'object_key', type: 'varchar', length: 512, unique: true }) objectKey: string;
  @Column({ name: 'original_name', type: 'varchar', length: 255 }) originalName: string;
  @Column({ name: 'content_type', type: 'varchar', length: 128 }) contentType: string;
  @Column({ name: 'byte_size', type: 'int' }) byteSize: number;
  @CreateDateColumn({ name: 'uploaded_at' }) uploadedAt: Date;
  @OneToMany(() => MedicalResult, (result) => result.file) results: Relation<MedicalResult[]>;
}
