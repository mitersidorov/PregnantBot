import { MigrationInterface, QueryRunner } from 'typeorm';

const requirements = [
  { id: '00000000-0000-4000-8000-000000000044', name: 'Thrombin time' },
  { id: '00000000-0000-4000-8000-000000000045', name: 'PTI (prothrombin index)' },
] as const;

const spermogramDescription =
  'After 2 days of abstinence. Valid for 6 months only if there are no abnormalities; discuss abnormal results with an andrologist.';

export class AddCoagulationChecklistRequirements1763218000000 implements MigrationInterface {
  name = 'AddCoagulationChecklistRequirements1763218000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE medical_results ADD COLUMN normality varchar(20) NULL');
    await queryRunner.query(
      `UPDATE checklist_progress p
       JOIN cycles c ON c.id = p.cycle_id
       JOIN requirements q ON q.id = p.requirement_id
       LEFT JOIN medical_results m ON m.id = p.result_id
       SET p.status = 'pending', p.result_id = NULL
       WHERE c.status = 'active' AND q.name = 'Spermogram'
         AND (m.id IS NULL OR m.normality IS NULL OR m.normality <> 'normal')`,
    );
    for (const requirement of requirements) {
      await queryRunner.query(
        'INSERT IGNORE INTO requirements (id, name, description, patient_applicability, cycle_day_hint, validity_days, active, version, branch_metadata) VALUES (?, ?, NULL, ?, NULL, ?, 1, 1, NULL)',
        [requirement.id, requirement.name, 'wife', 30],
      );
      await queryRunner.query(
        `INSERT IGNORE INTO checklist_progress (cycle_id, requirement_id, status, result_id)
         SELECT id, ?, 'pending', NULL FROM cycles WHERE status = 'active'`,
        [requirement.id],
      );
    }

    const spermogramMetadata = await this.readMetadata(queryRunner, 'Spermogram', 'husband');
    spermogramMetadata.validityAppliesOnlyIfNoAbnormalities = true;
    spermogramMetadata.onAbnormal = 'andrologist_review';
    await queryRunner.query(
      'UPDATE requirements SET description = ?, branch_metadata = ? WHERE name = ? AND patient_applicability = ?',
      [spermogramDescription, JSON.stringify(spermogramMetadata), 'Spermogram', 'husband'],
    );

    const therapistMetadata = await this.readMetadata(queryRunner, 'Therapist conclusion', 'wife');
    therapistMetadata.rubellaIfPriorResultShowsAbsentAntibodies = {
      options: ['vaccination', 'informed_refusal'],
      possibleTreatmentDelayMonths: [1, 3],
    };
    await queryRunner.query(
      'UPDATE requirements SET branch_metadata = ? WHERE name = ? AND patient_applicability = ?',
      [JSON.stringify(therapistMetadata), 'Therapist conclusion', 'wife'],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const requirement of requirements) {
      await queryRunner.query('DELETE FROM checklist_progress WHERE requirement_id = ?', [requirement.id]);
      await queryRunner.query('DELETE FROM requirements WHERE id = ?', [requirement.id]);
    }
    await queryRunner.query(
      'UPDATE requirements SET description = ?, branch_metadata = NULL WHERE name = ? AND patient_applicability = ?',
      ['After 2 days of abstinence.', 'Spermogram', 'husband'],
    );
    await queryRunner.query(
      'UPDATE requirements SET branch_metadata = ? WHERE name = ? AND patient_applicability = ?',
      [JSON.stringify({ assessContraindications: true }), 'Therapist conclusion', 'wife'],
    );
    await queryRunner.query('ALTER TABLE medical_results DROP COLUMN normality');
  }

  private async readMetadata(
    queryRunner: QueryRunner,
    name: string,
    applicability: 'wife' | 'husband',
  ): Promise<Record<string, unknown>> {
    const rows = (await queryRunner.query(
      'SELECT branch_metadata FROM requirements WHERE name = ? AND patient_applicability = ? LIMIT 1',
      [name, applicability],
    )) as Array<{ branch_metadata?: unknown }>;
    if (!rows[0]) throw new Error(`Checklist requirement is missing: ${name}`);
    const value = rows[0].branch_metadata;
    if (value && typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, unknown>) };
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        throw new Error(`Checklist branch metadata is invalid JSON: ${name}`);
      }
    }
    return {};
  }
}
