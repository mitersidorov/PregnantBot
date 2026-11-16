import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { CyclesController } from './cycles.controller';

describe('CyclesController', () => {
  it('restricts cycle creation to the configured wife role', async () => {
    const controller = new CyclesController({ create: jest.fn() } as never);
    expect(() =>
      controller.create({ startDate: '2026-11-15' }, { telegramUser: { id: 202 }, patientRole: 'husband' } as never),
    ).toThrow(ForbiddenException);
  });
});
