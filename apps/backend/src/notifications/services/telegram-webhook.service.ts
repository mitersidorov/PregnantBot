import { Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { configuredTelegramRoles } from '../../auth/guards/telegram-init-data.guard';
import { TelegramNotificationService } from './telegram-notification.service';

interface TelegramUpdate {
  message?: {
    text?: string;
    from?: { id?: number };
    chat?: { id?: number; type?: string };
  };
}

@Injectable()
export class TelegramWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramWebhookService.name);
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempt = 0;
  constructor(private readonly telegram: TelegramNotificationService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.TELEGRAM_REGISTER_WEBHOOK_ON_START?.trim().toLowerCase() !== 'true') {
      this.logger.log('Skipping Telegram webhook registration; using the webhook already configured with Telegram.');
      return;
    }

    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
      throw new Error('TELEGRAM_WEBHOOK_URL is required when TELEGRAM_REGISTER_WEBHOOK_ON_START=true.');
    }

    const parsedUrl = new URL(webhookUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('TELEGRAM_WEBHOOK_URL must use HTTPS.');
    }
    const secretToken = this.configuredSecretToken();
    await this.registerWebhook(parsedUrl.toString(), secretToken);
  }

  onModuleDestroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private async registerWebhook(url: string, secretToken: string): Promise<void> {
    try {
      await this.telegram.setWebhook(url, secretToken);
      this.retryAttempt = 0;
      this.logger.log('Telegram webhook registration succeeded.');
    } catch (error) {
      const retryDelayMs = Math.min(300_000, 5_000 * 2 ** Math.min(this.retryAttempt, 6));
      this.retryAttempt += 1;
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      this.logger.warn(`Telegram webhook registration failed; retrying in ${retryDelayMs}ms (${errorName}).`);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined;
        void this.registerWebhook(url, secretToken);
      }, retryDelayMs);
      this.retryTimer.unref?.();
    }
  }

  async handleUpdate(secretHeader: string | undefined, update: TelegramUpdate): Promise<{ ok: true }> {
    if (!this.isValidSecret(secretHeader)) {
      this.logger.warn('Telegram webhook request rejected: invalid secret token.');
      throw new UnauthorizedException();
    }

    const message = update?.message;
    if (
      typeof message?.text !== 'string' ||
      !/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(message.text) ||
      message.chat?.type !== 'private' ||
      !Number.isSafeInteger(message.chat.id) ||
      !Number.isSafeInteger(message.from?.id)
    ) {
      return { ok: true };
    }

    const roles = configuredTelegramRoles();
    const userId = message.from!.id!;
    const role = roles.get(userId);
    this.logger.log(`Telegram /start received userId=${userId} allowed=${Boolean(role)}${role ? ` role=${role}` : ''}`);
    const reply = role ? 'Доступ подтверждён. Откройте веб-приложение из меню бота.' : 'Простите, у вас нет доступа.';
    try {
      await this.telegram.sendMessage(String(message.chat!.id), reply);
      this.logger.log(`Telegram /start reply sent userId=${userId}`);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      this.logger.error(`Telegram /start reply failed userId=${userId} error=${errorName}`);
      // Keep the webhook request failed so Telegram can retry this update after a transient
      // outbound API/network failure. HttpService records the sanitized transport cause.
      throw error;
    }
    return { ok: true };
  }

  private isValidSecret(provided: string | undefined): boolean {
    if (!provided) return false;
    const configured = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!configured || configured.length > 256 || !/^[A-Za-z0-9_-]+$/.test(configured)) return false;
    const expectedBytes = Buffer.from(configured, 'utf8');
    const providedBytes = Buffer.from(provided, 'utf8');
    return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
  }

  private configuredSecretToken(): string {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!secret || secret.length > 256 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 1-256 characters from A-Z, a-z, 0-9, _ or -.');
    }
    return secret;
  }
}
