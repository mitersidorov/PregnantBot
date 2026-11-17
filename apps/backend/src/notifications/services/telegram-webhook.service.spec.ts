import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { TelegramNotificationService } from './telegram-notification.service';
import { TelegramWebhookService } from './telegram-webhook.service';

describe('TelegramWebhookService', () => {
  const previous = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    baseUrl: process.env.TELEGRAM_API_BASE_URL,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    url: process.env.TELEGRAM_WEBHOOK_URL,
    wife: process.env.TELEGRAM_WIFE_USER_ID,
    husband: process.env.TELEGRAM_HUSBAND_USER_ID,
  };

  afterEach(() => {
    const entries = [
      ['TELEGRAM_BOT_TOKEN', previous.botToken],
      ['TELEGRAM_API_BASE_URL', previous.baseUrl],
      ['TELEGRAM_WEBHOOK_SECRET', previous.secret],
      ['TELEGRAM_WEBHOOK_URL', previous.url],
      ['TELEGRAM_WIFE_USER_ID', previous.wife],
      ['TELEGRAM_HUSBAND_USER_ID', previous.husband],
    ] as const;
    for (const [key, value] of entries) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  const setup = () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'synthetic_webhook_secret';
    process.env.TELEGRAM_WIFE_USER_ID = '101';
    process.env.TELEGRAM_HUSBAND_USER_ID = '202';
    const telegram = {
      sendMessage: jest.fn(async (chatId: string, text: string) => {
        void chatId;
        void text;
      }),
      setWebhook: jest.fn(async (url: string, secret: string) => {
        void url;
        void secret;
      }),
    };
    return { service: new TelegramWebhookService(telegram as unknown as TelegramNotificationService), telegram };
  };

  const update = (userId: number, text = '/start') => ({
    message: {
      text,
      from: { id: userId },
      chat: { id: userId, type: 'private' },
    },
  });

  it('replies to an allowlisted /start sender and politely denies an outsider', async () => {
    const { service, telegram } = setup();
    await expect(service.handleUpdate('synthetic_webhook_secret', update(202))).resolves.toEqual({ ok: true });
    await expect(service.handleUpdate('synthetic_webhook_secret', update(303))).resolves.toEqual({ ok: true });
    expect(telegram.sendMessage).toHaveBeenNthCalledWith(
      1,
      '202',
      'Доступ подтверждён. Откройте веб-приложение из меню бота.',
    );
    expect(telegram.sendMessage).toHaveBeenNthCalledWith(2, '303', 'Простите, у вас нет доступа.');
  });

  it('rejects a request with the wrong webhook secret', async () => {
    const { service, telegram } = setup();
    await expect(service.handleUpdate('wrong-secret', update(101))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores updates other than private /start messages', async () => {
    const { service, telegram } = setup();
    await service.handleUpdate('synthetic_webhook_secret', update(101, '/help'));
    await service.handleUpdate('synthetic_webhook_secret', {
      message: { text: '/start', from: { id: 101 }, chat: { id: -100, type: 'group' } },
    });
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('registers the HTTPS webhook with Telegram when configured', async () => {
    const { service, telegram } = setup();
    process.env.TELEGRAM_WEBHOOK_URL = 'https://app.example.test/api/webhooks/telegram';
    await service.onModuleInit();
    expect(telegram.setWebhook).toHaveBeenCalledWith(
      'https://app.example.test/api/webhooks/telegram',
      'synthetic_webhook_secret',
    );
  });
});
