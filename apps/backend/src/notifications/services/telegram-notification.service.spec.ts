import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { HttpService } from '../../common/http/http.service';
import { TelegramNotificationService } from './telegram-notification.service';

describe('TelegramNotificationService', () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousBaseUrl = process.env.TELEGRAM_API_BASE_URL;

  afterEach(() => {
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    if (previousBaseUrl === undefined) delete process.env.TELEGRAM_API_BASE_URL;
    else process.env.TELEGRAM_API_BASE_URL = previousBaseUrl;
    jest.restoreAllMocks();
  });

  it('posts only the requested chat and message to the configured Telegram API base URL', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'synthetic-bot-token';
    process.env.TELEGRAM_API_BASE_URL = 'http://telegram-stub:8080/';
    const http = {
      post: jest.fn(async (url: string, body: unknown) => {
        void url;
        void body;
        return { data: { ok: true }, status: 200, headers: {} };
      }),
    };
    const service = new TelegramNotificationService(http as unknown as HttpService);

    await service.sendMessage('101', 'Synthetic reminder');

    expect(http.post).toHaveBeenCalledWith('http://telegram-stub:8080/botsynthetic-bot-token/sendMessage', {
      chat_id: '101',
      text: 'Synthetic reminder',
      disable_web_page_preview: true,
    });
  });

  it('uses Telegram official API by default', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'synthetic-bot-token';
    delete process.env.TELEGRAM_API_BASE_URL;
    const http = {
      post: jest.fn(async (url: string, body: unknown) => {
        void url;
        void body;
        return { data: { ok: true }, status: 200, headers: {} };
      }),
    };
    const service = new TelegramNotificationService(http as unknown as HttpService);

    await service.sendMessage('202', 'Synthetic reminder');

    expect(http.post).toHaveBeenCalledWith(
      'https://api.telegram.org/botsynthetic-bot-token/sendMessage',
      expect.objectContaining({ chat_id: '202' }),
    );
  });
});
