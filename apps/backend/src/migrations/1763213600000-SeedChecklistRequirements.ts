import { MigrationInterface, QueryRunner } from 'typeorm';

type SeedRow = {
  id: string;
  name: string;
  patient: 'wife' | 'husband';
  days: number | null;
  cycleDay?: number;
  description?: string;
  branch?: Record<string, unknown>;
};

const rows: SeedRow[] = [
  ...[
    ['anti-Treponema', 90],
    ['Combined HIV Ag/Ab + P24', 90],
    ['HBsAg', 90],
    ['anti-HCV', 90],
    ['N. gonorrhoeae cervical PCR', 180],
    ['T. vaginalis cervical PCR', 180],
    ['C. trachomatis cervical PCR', 180],
    ['Flora smear', 30],
    ['Complete blood count (CBC)', 30],
    ['Erythrocyte sedimentation rate (ESR)', 30],
    ['Urinalysis', 30],
    ['ALT', 30],
    ['AST', 30],
    ['Total bilirubin', 30],
    ['Glucose', 30],
    ['Urea', 30],
    ['Creatinine', 30],
    ['APTT', 30],
    ['INR', 30],
    ['Fibrinogen', 30],
    ['AMH', 180],
    ['TSH', 180],
    ['Free T4', 180],
    ['Blood group and Rh factor', null],
    ['Pap cytology', 365],
    ['ECG', 365],
    ['Therapist conclusion', 365],
  ].map(([name, days], index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: String(name),
    patient: 'wife' as const,
    days: days === null ? null : Number(days),
    ...(name === 'Therapist conclusion' ? { branch: { assessContraindications: true } } : {}),
  })),
  {
    id: '00000000-0000-4000-8000-000000000028',
    name: 'Breast ultrasound (under age 40)',
    patient: 'wife',
    days: 365,
    cycleDay: 5,
    description: 'Schedule on cycle days 5–10.',
    branch: { cycleDayRange: [5, 10], underAge: 40, onAbnormal: 'relevant_specialist' },
  },
  {
    id: '00000000-0000-4000-8000-000000000029',
    name: 'Pelvic ultrasound',
    patient: 'wife',
    days: 365,
    cycleDay: 7,
    description: 'After bleeding ends, on cycle days 7–11.',
    branch: { cycleDayRange: [7, 11], afterBleedingEnds: true, onAbnormal: 'relevant_specialist' },
  },
  {
    id: '00000000-0000-4000-8000-000000000030',
    name: 'Thyroid ultrasound',
    patient: 'wife',
    days: 365,
    branch: { onAbnormal: 'relevant_specialist' },
  },
  {
    id: '00000000-0000-4000-8000-000000000031',
    name: 'Fluorography',
    patient: 'wife',
    days: 365,
    branch: { conditional: 'only_if_indicated' },
  },
  {
    id: '00000000-0000-4000-8000-000000000032',
    name: 'Oncologist-mammologist conclusion',
    patient: 'wife',
    days: 365,
    branch: { conditional: 'only_if_indicated' },
  },
  {
    id: '00000000-0000-4000-8000-000000000033',
    name: 'Genetic conclusion',
    patient: 'wife',
    days: 365,
    branch: { conditional: 'only_if_indicated' },
  },
  ...[
    ['Syphilis (anti-Treponema)', 90],
    ['HIV Ag/Ab + P24', 90],
    ['HBsAg', 90],
    ['anti-HCV', 90],
    ['Spermogram', 180],
    ['N. gonorrhoeae PCR', 180],
    ['T. vaginalis PCR', 180],
    ['C. trachomatis PCR', 180],
    ['Blood group and Rh factor', null],
    ['Andrologist conclusion', 180],
  ].map(([name, days], index) => ({
    id: `00000000-0000-4000-8000-${String(index + 34).padStart(12, '0')}`,
    name: String(name),
    patient: 'husband' as const,
    days: days === null ? null : Number(days),
    ...(name === 'Spermogram' ? { description: 'After 2 days of abstinence.' } : {}),
  })),
];

// Seeds only the user-confirmed checklist rows and explicit conditional follow-up metadata.
export class SeedChecklistRequirements1763213600000 implements MigrationInterface {
  name = 'SeedChecklistRequirements1763213600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE requirements ADD COLUMN branch_metadata json NULL');
    for (const row of rows) {
      await queryRunner.query(
        'INSERT INTO requirements (id, name, description, patient_applicability, cycle_day_hint, validity_days, active, version, branch_metadata) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?) ',
        [
          row.id,
          row.name,
          row.description ?? null,
          row.patient,
          row.cycleDay ?? null,
          row.days,
          row.branch ? JSON.stringify(row.branch) : null,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const row of rows) await queryRunner.query('DELETE FROM requirements WHERE id = ?', [row.id]);
    await queryRunner.query('ALTER TABLE requirements DROP COLUMN branch_metadata');
  }
}
