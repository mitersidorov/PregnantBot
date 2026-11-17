import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExtractedFindingsToMedicalResults1794873600000 implements MigrationInterface {
  name = 'AddExtractedFindingsToMedicalResults1794873600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE medical_results ADD COLUMN extracted_findings JSON NULL AFTER summary');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE medical_results DROP COLUMN extracted_findings');
  }
}
