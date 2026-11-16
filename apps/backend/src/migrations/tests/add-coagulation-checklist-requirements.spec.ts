import { describe, expect, it, jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { AddCoagulationChecklistRequirements1763218000000 } from '../1763218000000-AddCoagulationChecklistRequirements';

describe('AddCoagulationChecklistRequirements1763218000000', () => {
  it('adds the missing analytes, initializes active cycles, and preserves conditional metadata', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const queryRunner = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        if (sql.startsWith('SELECT branch_metadata') && parameters?.[0] === 'Therapist conclusion') {
          return [{ branch_metadata: JSON.stringify({ assessContraindications: true }) }];
        }
        if (sql.startsWith('SELECT branch_metadata') && parameters?.[0] === 'Spermogram') {
          return [{ branch_metadata: null }];
        }
        return [];
      }),
    } as unknown as QueryRunner;

    await new AddCoagulationChecklistRequirements1763218000000().up(queryRunner);

    expect(calls.some(({ sql }) => sql === 'ALTER TABLE medical_results ADD COLUMN normality varchar(20) NULL')).toBe(
      true,
    );
    expect(
      calls.some(({ sql }) => sql.includes("q.name = 'Spermogram'") && sql.includes("m.normality <> 'normal'")),
    ).toBe(true);
    const inserted = calls.filter(({ sql }) => sql.startsWith('INSERT IGNORE INTO requirements'));
    expect(inserted).toHaveLength(2);
    expect(inserted.map(({ parameters }) => parameters?.slice(1, 4))).toEqual([
      ['Thrombin time', 'wife', 30],
      ['PTI (prothrombin index)', 'wife', 30],
    ]);
    expect(calls.filter(({ sql }) => sql.includes('INSERT IGNORE INTO checklist_progress'))).toHaveLength(2);
    const spermogramUpdate = calls.find(
      ({ sql, parameters }) =>
        sql.startsWith('UPDATE requirements SET description') && parameters?.[2] === 'Spermogram',
    );
    expect(spermogramUpdate?.parameters?.[0]).toContain('only if there are no abnormalities');
    expect(spermogramUpdate?.parameters?.[1]).toContain('validityAppliesOnlyIfNoAbnormalities');
    const therapistUpdate = calls.find(
      ({ sql, parameters }) =>
        sql.startsWith('UPDATE requirements SET branch_metadata') && parameters?.[1] === 'Therapist conclusion',
    );
    expect(therapistUpdate?.parameters?.[0]).toContain('assessContraindications');
    expect(therapistUpdate?.parameters?.[0]).toContain('rubellaIfPriorResultShowsAbsentAntibodies');
  });

  it('removes only its new progress and requirement rows and restores prior metadata on down', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const queryRunner = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        return [];
      }),
    } as unknown as QueryRunner;

    await new AddCoagulationChecklistRequirements1763218000000().down(queryRunner);

    expect(calls.filter(({ sql }) => sql.startsWith('DELETE FROM checklist_progress'))).toHaveLength(2);
    expect(calls.filter(({ sql }) => sql.startsWith('DELETE FROM requirements'))).toHaveLength(2);
    expect(
      calls.some(
        ({ sql, parameters }) =>
          sql.startsWith('UPDATE requirements SET description') && parameters?.[0] === 'After 2 days of abstinence.',
      ),
    ).toBe(true);
    expect(
      calls.some(
        ({ sql, parameters }) =>
          sql.startsWith('UPDATE requirements SET branch_metadata') &&
          parameters?.[0] === '{"assessContraindications":true}',
      ),
    ).toBe(true);
    expect(calls.at(-1)?.sql).toBe('ALTER TABLE medical_results DROP COLUMN normality');
  });
});
