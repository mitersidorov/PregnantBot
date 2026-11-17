import { describe, expect, it } from '@jest/globals';
import { PUBLIC_ROUTE_METADATA } from '../../auth/decorators/public-route.decorator';
import { TelegramWebhookController } from './telegram-webhook.controller';

describe('TelegramWebhookController', () => {
  it('registers the secret-validated Telegram endpoint as public but still throttled', () => {
    const handler = TelegramWebhookController.prototype.receive;
    expect(Reflect.getMetadata('path', TelegramWebhookController)).toBe('webhooks/telegram');
    expect(Reflect.getMetadata('method', handler)).toBe(1);
    expect(Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler)).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(30);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60000);
  });
});
