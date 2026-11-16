import { describe, expect, it, jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { SeedChecklistRequirements1763213600000 } from '../1763213600000-SeedChecklistRequirements';

describe('SeedChecklistRequirements1763213600000', () => {
  it('seeds only confirmed rows with the approved patient, validity, and branch metadata', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const queryRunner = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        calls.push({ sql, parameters });
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new SeedChecklistRequirements1763213600000();
    await migration.up(queryRunner);
    const rows = calls
      .filter(({ sql }) => sql.startsWith('INSERT INTO requirements'))
      .map(({ parameters }) => parameters!);
    const byName = new Map(rows.map((row) => [row[1], row]));
    expect(byName.get('AMH')?.slice(3, 6)).toEqual(['wife', null, 180]);
    expect(byName.get('Blood group and Rh factor')?.[5]).toBeNull();
    expect(byName.get('Spermogram')?.[3]).toBe('husband');
    expect(byName.get('Spermogram')?.[2]).toContain('2 days of abstinence');
    expect(byName.get('Spermogram')?.[5]).toBe(180);
    expect(byName.get('Breast ultrasound (under age 40)')?.[6]).toContain('cycleDayRange');
    expect(byName.get('Pelvic ultrasound')?.[6]).toContain('afterBleedingEnds');
    expect(byName.get('Therapist conclusion')?.[6]).toContain('assessContraindications');
    expect(byName.get('Fluorography')?.[6]).toContain('only_if_indicated');
    for (const excluded of [
      'FSH',
      'LH',
      'Estradiol',
      'Prolactin',
      'Rubella IgM',
      'Rubella IgG',
      'Mammography',
      'Karyotype',
    ]) {
      expect([...byName.keys()].some((name) => String(name).toLowerCase().includes(excluded.toLowerCase()))).toBe(
        false,
      );
    }
    expect(byName.has('PT')).toBe(false);
    expect(byName.has('PTI (prothrombin index)')).toBe(false);
    expect(byName.has('Thrombin time')).toBe(false);
    expect(rows).toHaveLength(43);
  });

  it('reverses every seeded row and the metadata column', async () => {
    const calls: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    await new SeedChecklistRequirements1763213600000().down(queryRunner);
    expect(calls.filter((sql) => sql.startsWith('DELETE FROM requirements'))).toHaveLength(43);
    expect(calls.at(-1)).toBe('ALTER TABLE requirements DROP COLUMN branch_metadata');
  });
});
