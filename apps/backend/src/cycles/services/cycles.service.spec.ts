import { describe, expect, it, jest } from '@jest/globals';
import { CyclesService } from './cycles.service';

describe('CyclesService', () => {
  it('creates the attempt and initializes its checklist in the same transaction', async () => {
    const cycle = { id: 'cycle-id', startDate: '2026-11-15', status: 'active', startedBy: '101' };
    const cycleRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: cycle.id })),
      findOne: jest.fn(async () => ({ ...cycle, checklist: [] })),
    };
    const manager = { getRepository: jest.fn(() => cycleRepository) };
    const runner = {
      connect: jest.fn(async () => undefined),
      startTransaction: jest.fn(async () => undefined),
      commitTransaction: jest.fn(async () => undefined),
      rollbackTransaction: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
      manager,
    };
    const checklist = {
      initializeForCycle: jest.fn<(manager: unknown, cycle: unknown) => Promise<void>>().mockResolvedValue(undefined),
    };
    const service = new CyclesService(
      cycleRepository as never,
      { createQueryRunner: () => runner } as never,
      checklist as never,
    );

    await service.create(cycle.startDate, 101);

    expect(checklist.initializeForCycle).toHaveBeenCalledWith(manager, expect.objectContaining({ id: cycle.id }));
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back attempt creation when checklist initialization fails', async () => {
    const cycle = { id: 'cycle-id', startDate: '2026-11-15', status: 'active', startedBy: '101' };
    const cycleRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: cycle.id })),
    };
    const runner = {
      connect: jest.fn(async () => undefined),
      startTransaction: jest.fn(async () => undefined),
      commitTransaction: jest.fn(async () => undefined),
      rollbackTransaction: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
      manager: { getRepository: jest.fn(() => cycleRepository) },
    };
    const checklist = {
      initializeForCycle: jest
        .fn<(manager: unknown, cycle: unknown) => Promise<void>>()
        .mockRejectedValue(new Error('seed failed')),
    };
    const service = new CyclesService(
      cycleRepository as never,
      { createQueryRunner: () => runner } as never,
      checklist as never,
    );

    await expect(service.create(cycle.startDate, 101)).rejects.toThrow('seed failed');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
});
