import { afterAll, beforeAll, describe, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { AuthModule } from '../auth.module';

function signedInitData(userId: number): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: 'Synthetic' }),
  });
  const data = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update('auth-me-test-token').digest();
  params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return params.toString();
}

describe('GET /auth/me', () => {
  const originalEnv = {
    API_KEY: process.env.API_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WIFE_USER_ID: process.env.TELEGRAM_WIFE_USER_ID,
    TELEGRAM_HUSBAND_USER_ID: process.env.TELEGRAM_HUSBAND_USER_ID,
  };
  let app: INestApplication;

  beforeAll(async () => {
    process.env.API_KEY = 'auth-me-test-api-key';
    process.env.TELEGRAM_BOT_TOKEN = 'auth-me-test-token';
    process.env.TELEGRAM_WIFE_USER_ID = '101';
    process.env.TELEGRAM_HUSBAND_USER_ID = '202';
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.each([
    [101, 'wife'],
    [202, 'husband'],
  ] as const)('returns only the assigned role for Telegram user %i', async (userId, patientRole) => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('X-API-KEY', 'auth-me-test-api-key')
      .set('X-Telegram-Init-Data', signedInitData(userId))
      .expect(200)
      .expect({ patientRole, telegramUserId: String(userId) });
  });

  it('rejects requests without Telegram authentication', async () => {
    await request(app.getHttpServer()).get('/auth/me').set('X-API-KEY', 'auth-me-test-api-key').expect(401);
  });
});
