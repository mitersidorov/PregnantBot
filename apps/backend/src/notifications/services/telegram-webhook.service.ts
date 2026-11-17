import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
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
export class TelegramWebhookService implements OnModuleInit {
  constructor(private readonly telegram: TelegramNotificationService) {}

  async onModuleInit(): Promise<void> {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
    if (!webhookUrl) return;

    const parsedUrl = new URL(webhookUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('TELEGRAM_WEBHOOK_URL must use HTTPS.');
    }
    const secretToken = this.configuredSecretToken();
    await this.telegram.setWebhook(parsedUrl.toString(), secretToken);
  }

  async handleUpdate(secretHeader: string | undefined, update: TelegramUpdate): Promise<{ ok: true }> {
    if (!this.isValidSecret(secretHeader)) throw new UnauthorizedException();

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
    const role = roles.get(message.from!.id!);
    const reply = role ? 'Доступ подтверждён. Откройте веб-приложение из меню бота.' : 'Простите, у вас нет доступа.';
    await this.telegram.sendMessage(String(message.chat!.id), reply);
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
