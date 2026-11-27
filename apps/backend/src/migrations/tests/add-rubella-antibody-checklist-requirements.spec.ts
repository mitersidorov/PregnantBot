import { describe, expect, it, jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { AddRubellaAntibodyChecklistRequirements1794877200000 } from '../1794877200000-AddRubellaAntibodyChecklistRequirements';

describe('AddRubellaAntibodyChecklistRequirements1794877200000', () => {
  it('adds both rubella antibody requirements and initializes active cycles', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const queryRunner = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        return [];
      }),
    } as unknown as QueryRunner;

    await new AddRubellaAntibodyChecklistRequirements1794877200000().up(queryRunner);

    const inserted = calls.filter(({ sql }) => sql.startsWith('INSERT IGNORE INTO requirements'));
    expect(inserted).toHaveLength(2);
    expect(inserted.map(({ parameters }) => parameters?.slice(0, 4))).toEqual([
      ['00000000-0000-4000-8000-000000000046', 'Rubella IgG', 'wife', 365],
      ['00000000-0000-4000-8000-000000000047', 'Rubella IgM', 'wife', 365],
    ]);
    expect(calls.filter(({ sql }) => sql.includes('INSERT IGNORE INTO checklist_progress'))).toHaveLength(2);
  });

  it('removes only its progress and requirement rows on down', async () => {
    const calls: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;

    await new AddRubellaAntibodyChecklistRequirements1794877200000().down(queryRunner);

    expect(calls.filter((sql) => sql.startsWith('DELETE FROM checklist_progress'))).toHaveLength(2);
    expect(calls.filter((sql) => sql.startsWith('DELETE FROM requirements'))).toHaveLength(2);
  });
});
