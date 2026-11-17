import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { Cycle } from '../../cycles/entities/cycle.entity';
import { MedicalResult } from '../../records/entities/medical-result.entity';
import { ChecklistProgress } from '../entities/checklist-progress.entity';
import { Requirement } from '../entities/requirement.entity';
import { ChecklistService } from './checklist.service';

describe('ChecklistService', () => {
  const setupUpdate = (patientApplicability = 'wife', resultId: string | null = null) => {
    const row = { cycleId: 'cycle-id', requirementId: 'req-id', resultId, status: 'pending' };
    const cycleRepository = { findOneBy: jest.fn(async () => ({ id: 'cycle-id' })) };
    const progressRepository = {
      findOneBy: jest.fn(async () => row),
      save: jest.fn<(value: unknown) => Promise<typeof row>>().mockResolvedValue(row),
    };
    const requirement = { id: 'req-id', patientApplicability };
    const requirementRepository = { findOneBy: jest.fn(async () => requirement) };
    const service = new ChecklistService(
      cycleRepository as never,
      progressRepository as never,
      requirementRepository as never,
    );
    return { service, progressRepository, row };
  };

  it('prevents the husband from changing a wife-only requirement', async () => {
    const { service, progressRepository } = setupUpdate('wife');
    await expect(service.updateProgressForRole('cycle-id', 'req-id', 'pending', 'husband')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(progressRepository.save).not.toHaveBeenCalled();
  });

  it('requires a linked confirmed result before marking a requirement complete', async () => {
    const { service, progressRepository } = setupUpdate('wife');
    await expect(service.updateProgressForRole('cycle-id', 'req-id', 'complete', 'wife')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(progressRepository.save).not.toHaveBeenCalled();
  });

  it('allows the responsible patient to update a requirement', async () => {
    const { service, progressRepository, row } = setupUpdate('wife');
    await expect(service.updateProgressForRole('cycle-id', 'req-id', 'not_applicable', 'wife')).resolves.toBe(row);
    expect(progressRepository.save).toHaveBeenCalledWith(row);
  });

  it('reuses a still-valid explicitly linked normal result in a new attempt', async () => {
    const requirement = {
      id: 'req-id',
      validityDays: 180,
      branchMetadata: { validityAppliesOnlyIfNoAbnormalities: true },
    };
    const saved: Array<Record<string, unknown>> = [];
    const requirementsRepository = { findBy: jest.fn(async () => [requirement]) };
    const progressRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value: Record<string, unknown>) => (saved.push(value), value)),
    };
    const resultsRepository = {
      createQueryBuilder: () => {
        const builder = {
          innerJoin: () => builder,
          where: () => builder,
          andWhere: () => builder,
          orderBy: () => builder,
          getOne: async () => ({ id: 'result-1', resultDate: '2026-10-01', normality: 'normal' }),
        };
        return builder;
      },
    };
    const manager = {
      getRepository: (entity: typeof Requirement | typeof ChecklistProgress | typeof MedicalResult) => {
        if (entity === Requirement) return requirementsRepository;
        if (entity === ChecklistProgress) return progressRepository;
        return resultsRepository;
      },
    };
    const service = new ChecklistService({} as never, {} as never, {} as never);

    await service.initializeForCycle(manager as never, { id: 'cycle-2', startDate: '2026-11-15' } as Cycle);

    expect(saved).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-2',
        requirementId: 'req-id',
        status: 'complete',
        resultId: 'result-1',
      }),
    ]);
  });

  it('does not reuse an abnormal result where normality is required', async () => {
    const requirement = {
      id: 'req-id',
      validityDays: 180,
      branchMetadata: { validityAppliesOnlyIfNoAbnormalities: true },
    };
    const progressRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const resultsRepository = {
      createQueryBuilder: () => {
        const builder = {
          innerJoin: () => builder,
          where: () => builder,
          andWhere: () => builder,
          orderBy: () => builder,
          getOne: async () => ({ id: 'abnormal-result', resultDate: '2026-10-01', normality: 'abnormal' }),
        };
        return builder;
      },
    };
    const manager = {
      getRepository: (entity: typeof Requirement | typeof ChecklistProgress | typeof MedicalResult) => {
        if (entity === Requirement) return { findBy: async () => [requirement] };
        if (entity === ChecklistProgress) return progressRepository;
        return resultsRepository;
      },
    };
    const service = new ChecklistService({} as never, {} as never, {} as never);

    await service.initializeForCycle(manager as never, { id: 'cycle-3', startDate: '2026-11-15' } as Cycle);

    expect(progressRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', resultId: null, requirementId: 'req-id' }),
    );
  });

  it('applies result validity when completing matching active attempts', async () => {
    const manager = {
      query: jest.fn<(query: string, parameters: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    };
    const service = new ChecklistService({} as never, {} as never, {} as never);
    const result = { id: 'result-1', resultDate: '2026-11-15', normality: 'normal' };
    const requirement = { id: 'req-1' };

    await service.applyConfirmedResult(manager as never, result as MedicalResult, [requirement as Requirement]);

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("SET p.status = 'complete'"), [
      'result-1',
      'req-1',
      '2026-11-15',
      '2026-11-15',
      'normal',
    ]);
  });

  it('uses the result date belonging to each finding when applying checklist links', async () => {
    const manager = {
      query: jest.fn<(query: string, parameters: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    };
    const service = new ChecklistService({} as never, {} as never, {} as never);
    const result = {
      id: 'result-1',
      resultDate: '2026-10-01',
      extractedFindings: [
        {
          testName: 'Общий анализ мочи',
          resultDate: '2026-10-01',
          summary: null,
          pageNumber: 1,
          requirementIds: ['urinalysis'],
        },
        {
          testName: 'Группа крови, резус-фактор',
          resultDate: '2018-04-12',
          summary: null,
          pageNumber: 9,
          requirementIds: ['rh-factor'],
        },
      ],
      normality: null,
    };

    await service.applyConfirmedResult(manager as never, result as MedicalResult, [
      { id: 'urinalysis' } as Requirement,
      { id: 'rh-factor' } as Requirement,
    ]);

    expect(manager.query.mock.calls.map(([, params]) => params)).toEqual([
      ['result-1', 'urinalysis', '2026-10-01', '2026-10-01', ''],
      ['result-1', 'rh-factor', '2018-04-12', '2018-04-12', ''],
    ]);
  });

  it('does not substitute another finding’s date when a linked finding date is unknown', async () => {
    const manager = {
      query: jest.fn<(query: string, parameters: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    };
    const service = new ChecklistService({} as never, {} as never, {} as never);

    await service.applyConfirmedResult(
      manager as never,
      {
        id: 'result-1',
        resultDate: '2026-10-01',
        extractedFindings: [
          { testName: 'Study A', resultDate: '2026-10-01', summary: null, pageNumber: 1, requirementIds: ['req-a'] },
          { testName: 'Study B', resultDate: null, summary: null, pageNumber: 2, requirementIds: ['req-b'] },
        ],
      } as MedicalResult,
      [{ id: 'req-b' } as Requirement],
    );

    expect(manager.query.mock.calls[0]?.[1]).toEqual(['result-1', 'req-b', null, null, '']);
  });

  it('resets active progress when a linked result is superseded', async () => {
    const manager = {
      query: jest.fn<(query: string, parameters: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    };
    const service = new ChecklistService({} as never, {} as never, {} as never);

    await service.resetActiveProgressForResult(manager as never, 'result-1');

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("SET p.status = 'pending', p.result_id = NULL"),
      ['result-1'],
    );
    expect(manager.query.mock.calls[0]?.[0]).toContain("c.status = 'active'");
  });
});
