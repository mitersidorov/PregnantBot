import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Cycle } from '../../cycles/entities/cycle.entity';
import { MedicalResult } from '../../records/entities/medical-result.entity';
import { NotificationSchedulerService } from './notification-scheduler.service';

describe('NotificationSchedulerService', () => {
  const wifeId = process.env.TELEGRAM_WIFE_USER_ID;
  const husbandId = process.env.TELEGRAM_HUSBAND_USER_ID;
  afterEach(() => {
    if (wifeId === undefined) delete process.env.TELEGRAM_WIFE_USER_ID;
    else process.env.TELEGRAM_WIFE_USER_ID = wifeId;
    if (husbandId === undefined) delete process.env.TELEGRAM_HUSBAND_USER_ID;
    else process.env.TELEGRAM_HUSBAND_USER_ID = husbandId;
    jest.restoreAllMocks();
  });

  const setup = (cycleRows: Cycle[] = [], resultRows: MedicalResult[] = []) => {
    const cycles = { find: jest.fn(async () => cycleRows) };
    const results = { find: jest.fn(async () => resultRows) };
    const deliveries = {
      insert: jest.fn(async (delivery: unknown) => void delivery),
      update: jest.fn(async (criteria: unknown, changes: unknown) => {
        void criteria;
        void changes;
        return { affected: 1 };
      }),
    };
    const telegram = {
      sendMessage: jest.fn(async (telegramId: string, text: string) => {
        void telegramId;
        void text;
      }),
    };
    const service = new NotificationSchedulerService(
      cycles as never,
      results as never,
      deliveries as never,
      telegram as never,
    );
    process.env.TELEGRAM_WIFE_USER_ID = '101';
    process.env.TELEGRAM_HUSBAND_USER_ID = '202';
    return { service, cycles, results, deliveries, telegram };
  };

  it('sends separate wife/husband outstanding items on Monday and Thursday for the following week', async () => {
    const cycle = {
      id: 'cycle-1',
      status: 'active',
      startDate: '2026-11-16',
      checklist: [
        {
          status: 'pending',
          result: null,
          requirement: {
            id: 'wife-test',
            name: 'CBC',
            patientApplicability: 'wife',
            validityDays: 30,
            cycleDayHint: 10,
          },
        },
        {
          status: 'pending',
          result: null,
          requirement: {
            id: 'husband-test',
            name: 'Spermogram',
            patientApplicability: 'husband',
            validityDays: 180,
            cycleDayHint: null,
            description: 'After 2 days abstinence',
          },
        },
        {
          status: 'pending',
          result: null,
          requirement: {
            id: 'later',
            name: 'Later ultrasound',
            patientApplicability: 'wife',
            validityDays: 365,
            cycleDayHint: 25,
          },
        },
        {
          status: 'complete',
          result: { interpretationStatus: 'confirmed', resultDate: '2026-11-01', supersededBy: null },
          requirement: {
            id: 'valid',
            name: 'Valid test',
            patientApplicability: 'wife',
            validityDays: 90,
            cycleDayHint: null,
          },
        },
        {
          status: 'pending',
          result: null,
          requirement: {
            id: 'optional',
            name: 'Conditional fluorography',
            patientApplicability: 'wife',
            validityDays: 365,
            cycleDayHint: null,
            branchMetadata: { conditional: 'only_if_indicated' },
          },
        },
      ],
    } as unknown as Cycle;
    const { service, deliveries, telegram } = setup([cycle]);

    await service.sendWeeklyChecklistReminders(new Date('2026-11-16T07:00:00.000Z'));
    await service.sendWeeklyChecklistReminders(new Date('2026-11-19T07:00:00.000Z'));

    expect(deliveries.insert).toHaveBeenCalledTimes(4);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(4);
    expect(telegram.sendMessage).toHaveBeenCalledWith('101', expect.stringContaining('CBC'));
    expect(telegram.sendMessage).toHaveBeenCalledWith('202', expect.stringContaining('Spermogram'));
    expect(telegram.sendMessage).not.toHaveBeenCalledWith('101', expect.stringContaining('Later ultrasound'));
    expect(telegram.sendMessage).not.toHaveBeenCalledWith('101', expect.stringContaining('Conditional fluorography'));
  });

  it('separates overdue cycle-day items from those due next week', async () => {
    const cycle = {
      id: 'cycle-old',
      status: 'active',
      startDate: '2026-11-01',
      checklist: [
        {
          status: 'pending',
          result: null,
          requirement: { name: 'Pelvic ultrasound', patientApplicability: 'wife', cycleDayHint: 7, validityDays: 365 },
        },
      ],
    } as unknown as Cycle;
    const { service, telegram } = setup([cycle]);
    await service.sendWeeklyChecklistReminders(new Date('2026-11-16T07:00:00.000Z'));
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '101',
      expect.stringContaining('Также остались просроченные пункты по дням цикла'),
    );
  });

  it('sends expiry notices within the 14-day window only to the applicable patient', async () => {
    const result = {
      id: 'result-1',
      testName: 'CBC',
      resultDate: '2026-10-20',
      interpretationStatus: 'confirmed',
      supersededBy: null,
      requirements: [
        { id: 'wife-cbc', name: 'CBC', validityDays: 90, patientApplicability: 'wife' },
        { id: 'husband-semen', name: 'Spermogram', validityDays: 180, patientApplicability: 'husband' },
      ],
    } as unknown as MedicalResult;
    const { service, deliveries, telegram } = setup([], [result]);
    await service.sendExpiringResultReminders(new Date('2027-01-04T07:00:00.000Z'));
    expect(deliveries.insert).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage).toHaveBeenCalledWith('101', expect.stringContaining('14 дн.'));
    expect(telegram.sendMessage).not.toHaveBeenCalledWith('202', expect.any(String));
  });

  it('does not send a six-month expiry notice for an abnormal or unclassified spermogram', async () => {
    const result = {
      id: 'spermogram-result',
      testName: 'Spermogram',
      resultDate: '2026-10-20',
      normality: 'abnormal',
      interpretationStatus: 'confirmed',
      supersededBy: null,
      requirements: [
        {
          id: 'spermogram',
          name: 'Spermogram',
          validityDays: 180,
          patientApplicability: 'husband',
          branchMetadata: { validityAppliesOnlyIfNoAbnormalities: true },
        },
      ],
    } as unknown as MedicalResult;
    const { service, deliveries, telegram } = setup([], [result]);
    await service.sendExpiringResultReminders(new Date('2027-04-04T07:00:00.000Z'));
    expect(deliveries.insert).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('retries a known HTTP 503 once and skips already sent or duplicate deliveries', async () => {
    const result = {
      id: 'result-retry',
      testName: 'CBC',
      resultDate: '2026-10-20',
      interpretationStatus: 'confirmed',
      supersededBy: null,
      requirements: [{ id: 'wife-cbc', name: 'CBC', validityDays: 90, patientApplicability: 'wife' }],
    } as unknown as MedicalResult;
    const deliveries = {
      insert: jest
        .fn<(delivery: unknown) => Promise<void>>()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062 })
        .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062 }),
      update: jest
        .fn<(criteria: unknown, changes: unknown) => Promise<{ affected: number }>>()
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 0 }),
    };
    const telegram = {
      sendMessage: jest
        .fn<(telegramId: string, text: string) => Promise<void>>()
        .mockRejectedValueOnce(new Error('External HTTP request failed with status 503'))
        .mockResolvedValueOnce(undefined),
    };
    const cycles = { find: jest.fn(async () => [] as Cycle[]) };
    const results = { find: jest.fn(async () => [result]) };
    const service = new NotificationSchedulerService(
      cycles as never,
      results as never,
      deliveries as never,
      telegram as never,
    );
    process.env.TELEGRAM_WIFE_USER_ID = '101';
    process.env.TELEGRAM_HUSBAND_USER_ID = '202';
    const now = new Date('2027-01-04T07:00:00.000Z');

    await service.sendExpiringResultReminders(now);
    await service.sendExpiringResultReminders(now);
    await service.sendExpiringResultReminders(now);

    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(deliveries.insert).toHaveBeenCalledTimes(3);
    expect(deliveries.update).toHaveBeenCalledTimes(4);
  });
});
