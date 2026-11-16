import { ExecutionContext } from '@nestjs/common';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { TelegramInitDataGuard } from './telegram-init-data.guard';

function signedInitData(userId: number, authDate = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify({ id: userId }) });
  const data = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update('test-bot-token').digest();
  params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return params.toString();
}

describe('TelegramInitDataGuard', () => {
  const guard = new TelegramInitDataGuard();
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
      TELEGRAM_WIFE_USER_ID: '101',
      TELEGRAM_HUSBAND_USER_ID: '202',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function context(initData: string): {
    execution: ExecutionContext;
    request: { headers: Record<string, string>; telegramUser?: { id: number }; patientRole?: 'wife' | 'husband' };
  } {
    const request: Record<string, unknown> = { headers: { 'x-telegram-init-data': initData } };
    return {
      execution: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext,
      request: request as {
        headers: Record<string, string>;
        telegramUser?: { id: number };
        patientRole?: 'wife' | 'husband';
      },
    };
  }

  it('accepts a fresh, signed allowlisted user and attaches the Telegram identity', () => {
    const { execution, request } = context(signedInitData(101));
    expect(guard.canActivate(execution)).toBe(true);
    expect(request.telegramUser).toEqual({ id: 101 });
    expect(request.patientRole).toBe('wife');
  });

  it('maps the second configured identity to the husband role', () => {
    const { execution, request } = context(signedInitData(202));
    expect(guard.canActivate(execution)).toBe(true);
    expect(request.patientRole).toBe('husband');
  });

  it('rejects an expired signature and a user outside the allowlist', () => {
    expect(() =>
      guard.canActivate(context(signedInitData(101, Math.floor(Date.now() / 1000) - 90000)).execution),
    ).toThrow();
    expect(() => guard.canActivate(context(signedInitData(303)).execution)).toThrow();
  });

  it('rejects role configuration with duplicate or malformed IDs at startup', () => {
    process.env.TELEGRAM_HUSBAND_USER_ID = '101';
    expect(() => guard.onModuleInit()).toThrow(/role-specific Telegram user ID/);

    process.env.TELEGRAM_HUSBAND_USER_ID = 'not-an-id';
    expect(() => guard.onModuleInit()).toThrow(/role-specific Telegram user ID/);
  });

  it('supports a single configured role for local development', () => {
    delete process.env.TELEGRAM_WIFE_USER_ID;
    process.env.TELEGRAM_HUSBAND_USER_ID = '202';
    expect(guard.onModuleInit()).toBeUndefined();
    const { execution, request } = context(signedInitData(202));
    expect(guard.canActivate(execution)).toBe(true);
    expect(request.patientRole).toBe('husband');
  });

  it('accepts the configured local test identity only in the test environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_TEST_USER_ID = '123169226';
    process.env.LOCAL_TEST_USER_ROLE = 'husband';
    const request = { headers: { 'x-local-test-user-id': '123169226' } };
    const execution = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(execution)).toBe(true);
    expect(request).toMatchObject({ telegramUser: { id: 123169226 }, patientRole: 'husband' });
  });

  it('does not accept the local test identity outside the test environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_TEST_USER_ID = '123169226';
    process.env.LOCAL_TEST_USER_ROLE = 'wife';
    const request = { headers: { 'x-local-test-user-id': '123169226' } };
    const execution = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(execution)).toThrow();
  });

  it('does not accept a different user through the local test header', () => {
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_TEST_USER_ID = '123169226';
    process.env.LOCAL_TEST_USER_ROLE = 'wife';
    const request = { headers: { 'x-local-test-user-id': '123169227' } };
    const execution = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(execution)).toThrow();
  });
});
