import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Cycle } from '../../cycles/entities/cycle.entity';
import { MedicalResult } from '../../records/entities/medical-result.entity';
import { NotificationDelivery } from '../entities/notification-delivery.entity';
import { TelegramNotificationService } from './telegram-notification.service';

const TIME_ZONE = 'Asia/Tbilisi';
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_NOTICE_DAYS = 14;
type PatientRole = 'wife' | 'husband';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @InjectRepository(Cycle) private readonly cycles: Repository<Cycle>,
    @InjectRepository(MedicalResult) private readonly results: Repository<MedicalResult>,
    @InjectRepository(NotificationDelivery) private readonly deliveries: Repository<NotificationDelivery>,
    private readonly telegram: TelegramNotificationService,
  ) {}

  @Cron('0 11 * * 1,4', { name: 'weekly-checklist-reminders', timeZone: TIME_ZONE })
  async sendWeeklyChecklistReminders(now = new Date()): Promise<void> {
    const today = dateInZone(now, TIME_ZONE);
    const weekStart = addDays(today, daysUntilNextMonday(today));
    const weekEnd = addDays(weekStart, 6);
    const recipients = configuredRecipients();
    const cycles = await this.cycles.find({
      where: { status: 'active' },
      relations: { checklist: { requirement: true, result: true } },
      order: { startDate: 'ASC' },
    });

    for (const cycle of cycles) {
      for (const role of ['wife', 'husband'] as const) {
        const recipientId = recipients[role];
        if (!recipientId) continue;
        const outstanding = cycle.checklist
          .filter((item) => appliesToRole(item.requirement.patientApplicability, role))
          .filter((item) => item.status !== 'not_applicable')
          .filter((item) => !isOnlyIfIndicated(item.requirement.branchMetadata))
          .filter(
            (item) =>
              item.status !== 'complete' || !isValidThrough(item.result, item.requirement.validityDays, weekEnd),
          )
          .filter((item) => {
            const dueDate = dueDateFor(cycle.startDate, item.requirement);
            return dueDate === null || dueDate <= weekEnd;
          });

        if (outstanding.length === 0) continue;
        const startDate = toDateOnly(cycle.startDate);
        const overdue = outstanding.filter((item) => {
          const dueDate = dueDateFor(cycle.startDate, item.requirement);
          return dueDate !== null && dueDate < weekStart;
        });
        const upcoming = outstanding.filter((item) => {
          const dueDate = dueDateFor(cycle.startDate, item.requirement);
          return dueDate === null || dueDate >= weekStart;
        });
        const formatLine = (item: (typeof outstanding)[number]) => {
          const hint = item.requirement.description ? ` — ${item.requirement.description}` : '';
          return `• ${item.requirement.name}${hint}`;
        };
        const message = [
          'Напоминание по протоколу на следующую неделю:',
          `цикл от ${startDate}`,
          ...(overdue.length > 0
            ? ['Также остались просроченные пункты по дням цикла:', ...overdue.map(formatLine)]
            : []),
          ...(upcoming.length > 0
            ? ['Пункты, срок которых наступит на следующей неделе:', ...upcoming.map(formatLine)]
            : []),
          'Если пункт уже выполнен, загрузите результат в веб-приложение и подтвердите распознавание.',
        ].join('\n');
        await this.deliverOnce(
          `checklist:${recipientId}:${cycle.id}:${today}`,
          recipientId,
          'weekly_checklist',
          message,
        );
      }
    }
  }

  @Cron('0 11 * * *', { name: 'result-expiry-reminders', timeZone: TIME_ZONE })
  async sendExpiringResultReminders(now = new Date()): Promise<void> {
    const today = dateInZone(now, TIME_ZONE);
    const recipients = configuredRecipients();
    const results = await this.results.find({
      where: { interpretationStatus: 'confirmed', supersededBy: IsNull() },
      relations: { requirements: true },
    });

    for (const result of results) {
      if (!result.resultDate) continue;
      for (const requirement of result.requirements ?? []) {
        if (requirement.validityDays == null || requirement.validityDays <= 0) continue;
        if (
          requirement.branchMetadata?.validityAppliesOnlyIfNoAbnormalities === true &&
          result.normality !== 'normal'
        ) {
          continue;
        }
        const expiresOn = addDays(result.resultDate, requirement.validityDays);
        const remainingDays = dayDifference(today, expiresOn);
        if (remainingDays < 1 || remainingDays > EXPIRY_NOTICE_DAYS) continue;

        const roles: PatientRole[] =
          requirement.patientApplicability === 'both'
            ? ['wife', 'husband']
            : requirement.patientApplicability === 'wife' || requirement.patientApplicability === 'husband'
              ? [requirement.patientApplicability]
              : [];
        for (const role of roles) {
          const recipientId = recipients[role];
          if (!recipientId) continue;
          const testName = result.testName || requirement.name;
          const message = `Через ${remainingDays} дн. истекает срок действия результата «${testName}». Дата результата: ${result.resultDate}; срок действия до ${expiresOn}.`;
          await this.deliverOnce(
            `expiry:${recipientId}:${result.id}:${requirement.id}:${expiresOn}`,
            recipientId,
            'result_expiry',
            message,
          );
        }
      }
    }
  }

  private async deliverOnce(
    idempotencyKey: string,
    recipientTelegramId: string,
    eventType: 'weekly_checklist' | 'result_expiry',
    text: string,
  ): Promise<boolean> {
    try {
      await this.deliveries.insert({
        idempotencyKey,
        recipientTelegramId,
        eventType,
        status: 'claimed',
        errorCode: null,
        sentAt: null,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const retryClaim = await this.deliveries.update(
        { idempotencyKey, status: 'retryable' },
        { status: 'claimed', errorCode: null },
      );
      if (retryClaim.affected !== 1) return false;
    }

    try {
      await this.telegram.sendMessage(recipientTelegramId, text);
      await this.deliveries.update({ idempotencyKey }, { status: 'sent', sentAt: new Date() });
      return true;
    } catch (error) {
      const retryable = isRetryableTelegramError(error);
      // Ambiguous errors keep a permanent reservation; known 429/5xx responses can be retried safely.
      await this.deliveries.update(
        { idempotencyKey },
        {
          status: retryable ? 'retryable' : 'failed',
          errorCode: retryable ? 'TELEGRAM_RETRYABLE' : 'TELEGRAM_SEND_FAILED',
        },
      );
      this.logger.error(`Telegram notification delivery failed (${eventType}).`);
      return false;
    }
  }
}

function configuredRecipients(): Partial<Record<PatientRole, string>> {
  const wife = process.env.TELEGRAM_WIFE_USER_ID?.trim();
  const husband = process.env.TELEGRAM_HUSBAND_USER_ID?.trim();
  const isId = (value: string | undefined) =>
    !!value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  if ((wife && !isId(wife)) || (husband && !isId(husband)) || (wife && wife === husband)) {
    throw new Error('TELEGRAM_WIFE_USER_ID and TELEGRAM_HUSBAND_USER_ID must be distinct positive numeric IDs.');
  }
  return {
    ...(wife ? { wife } : {}),
    ...(husband ? { husband } : {}),
  };
}

function appliesToRole(applicability: string, role: PatientRole): boolean {
  return applicability === 'both' || applicability === role;
}

function isOnlyIfIndicated(metadata: Record<string, unknown> | null): boolean {
  return typeof metadata?.conditional === 'string' && metadata.conditional.startsWith('only_if_');
}

function isValidThrough(result: MedicalResult | null, validityDays: number | null, through: string): boolean {
  if (!result || result.interpretationStatus !== 'confirmed' || result.supersededBy) return false;
  if (validityDays == null) return true;
  if (!result.resultDate) return false;
  return addDays(result.resultDate, validityDays) >= through;
}

function dueDateFor(cycleStartDate: string, requirement: { cycleDayHint: number | null }): string | null {
  if (requirement.cycleDayHint == null) return null;
  return addDays(cycleStartDate, Math.max(requirement.cycleDayHint - 1, 0));
}

function toDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function dateInZone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${toDateOnly(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / DAY_MS);
}

function daysUntilNextMonday(today: string): number {
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  return (8 - weekday) % 7 || 7;
}

function isDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const databaseError = error as { code?: string; errno?: number };
  return databaseError.code === 'ER_DUP_ENTRY' || databaseError.errno === 1062;
}

function isRetryableTelegramError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = /status (429|5\d\d)\b/.exec(error.message)?.[1];
  return status !== undefined;
}
