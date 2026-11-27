import { MigrationInterface, QueryRunner } from 'typeorm';

const requirement = {
  id: '00000000-0000-4000-8000-000000000046',
  name: 'IgM и IgG к вирусу краснухи',
} as const;

export class AddRubellaAntibodyChecklistRequirements1794877200000 implements MigrationInterface {
  name = 'AddRubellaAntibodyChecklistRequirements1794877200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'INSERT IGNORE INTO requirements (id, name, description, patient_applicability, cycle_day_hint, validity_days, active, version, branch_metadata) VALUES (?, ?, NULL, ?, NULL, ?, 1, 1, NULL)',
      [requirement.id, requirement.name, 'wife', null],
    );
    await queryRunner.query(
      `INSERT IGNORE INTO checklist_progress (cycle_id, requirement_id, status, result_id)
       SELECT id, ?, 'pending', NULL FROM cycles WHERE status = 'active'`,
      [requirement.id],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM checklist_progress WHERE requirement_id = ?', [requirement.id]);
    await queryRunner.query('DELETE FROM requirements WHERE id = ?', [requirement.id]);
  }
}
