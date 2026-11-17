import { describe, expect, it, jest } from '@jest/globals';
import { CyclesController } from './cycles.controller';

describe('CyclesController', () => {
  it.each([
    ['wife', 101],
    ['husband', 202],
  ] as const)('allows the authenticated %s to start a cycle', (patientRole, userId) => {
    const service = { create: jest.fn() };
    const controller = new CyclesController(service as never);
    controller.create(
      { startDate: '2026-11-15' },
      { telegramUser: { id: userId }, patientRole } as never,
    );
    expect(service.create).toHaveBeenCalledWith('2026-11-15', userId);
  });
});
