import { describe, expect, it, jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { AddRubellaAntibodyChecklistRequirements1794877200000 } from '../1794877200000-AddRubellaAntibodyChecklistRequirements';

describe('AddRubellaAntibodyChecklistRequirements1794877200000', () => {
  it('adds one one-time rubella antibody requirement and initializes active cycles', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const queryRunner = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        return [];
      }),
    } as unknown as QueryRunner;

    await new AddRubellaAntibodyChecklistRequirements1794877200000().up(queryRunner);

    const inserted = calls.filter(({ sql }) => sql.startsWith('INSERT IGNORE INTO requirements'));
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.parameters).toEqual([
      '00000000-0000-4000-8000-000000000046',
      'IgM и IgG к вирусу краснухи',
      'wife',
      null,
    ]);
    expect(calls.filter(({ sql }) => sql.includes('INSERT IGNORE INTO checklist_progress'))).toHaveLength(1);
  });

  it('removes only its progress and requirement rows on down', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const queryRunner = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        return [];
      }),
    } as unknown as QueryRunner;

    await new AddRubellaAntibodyChecklistRequirements1794877200000().down(queryRunner);

    const progressDeletes = calls.filter(({ sql }) => sql.startsWith('DELETE FROM checklist_progress'));
    const requirementDeletes = calls.filter(({ sql }) => sql.startsWith('DELETE FROM requirements'));
    expect(progressDeletes).toHaveLength(1);
    expect(progressDeletes[0]?.parameters).toEqual(['00000000-0000-4000-8000-000000000046']);
    expect(requirementDeletes).toHaveLength(1);
    expect(requirementDeletes[0]?.parameters).toEqual(['00000000-0000-4000-8000-000000000046']);
  });
});
