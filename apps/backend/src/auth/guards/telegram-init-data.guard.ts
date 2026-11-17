import { CanActivate, ExecutionContext, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';

interface TelegramUser {
  id: number;
  [key: string]: unknown;
}

export type AuthorizedRequest = Request & { telegramUser: TelegramUser; patientRole: 'wife' | 'husband' };
export type PatientRole = 'wife' | 'husband';

export function configuredTelegramRoles(): Map<number, PatientRole> {
  const roles = new Map<number, PatientRole>();
  const configured = [
    ['TELEGRAM_WIFE_USER_ID', 'wife'],
    ['TELEGRAM_HUSBAND_USER_ID', 'husband'],
  ] as const;
  for (const [variable, role] of configured) {
    const raw = process.env[variable]?.trim();
    if (!raw) continue;
    if (!/^\d+$/.test(raw)) return new Map();
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0 || roles.has(id)) return new Map();
    roles.set(id, role);
  }
  return roles;
}

// Verifies Telegram Web App initData signatures, freshness, and the configured account allowlist.
@Injectable()
export class TelegramInitDataGuard implements CanActivate, OnModuleInit {
  constructor(private readonly reflector: Reflector) {}

  onModuleInit(): void {
    if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !this.getAllowedIds()) {
      throw new Error('Telegram bot token and at least one valid role-specific Telegram user ID must be configured.');
    }
    const maxAge = Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ?? 86400);
    if (!Number.isSafeInteger(maxAge) || maxAge <= 0) {
      throw new Error('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must be a positive integer.');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, [context.getHandler(), context.getClass()])) {
      return true;
    }
    if (this.allowConfiguredLocalTestUser(request)) return true;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const allowedIds = this.getAllowedIds();
    if (!botToken || !allowedIds) throw this.unauthorized();

    const raw = request.headers['x-telegram-init-data'];
    if (typeof raw !== 'string' || !raw) throw this.unauthorized();
    const params = new URLSearchParams(raw);
    const entries = [...params.entries()];
    const hash = params.get('hash');
    if (!hash || entries.length !== new Set(entries.map(([key]) => key)).size) throw this.unauthorized();

    const dataCheckString = entries
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secret).update(dataCheckString).digest();
    const provided = /^[a-f0-9]{64}$/i.test(hash) ? Buffer.from(hash, 'hex') : Buffer.alloc(0);
    if (provided.length !== expected.length || !timingSafeEqual(expected, provided)) throw this.unauthorized();

    const authDate = Number(params.get('auth_date'));
    const maxAge = Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ?? 86400);
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(authDate) ||
      !Number.isSafeInteger(maxAge) ||
      maxAge <= 0 ||
      authDate > now + 30 ||
      now - authDate > maxAge
    ) {
      throw this.unauthorized();
    }

    let user: TelegramUser;
    try {
      user = JSON.parse(params.get('user') ?? '') as TelegramUser;
    } catch {
      throw this.unauthorized();
    }
    if (!Number.isSafeInteger(user?.id) || !allowedIds.has(user.id)) throw this.unauthorized();
    request.telegramUser = user;
    const roles = this.getRoles();
    const role = roles.get(user.id);
    if (!role) throw this.unauthorized();
    request.patientRole = role;
    return true;
  }

  private allowConfiguredLocalTestUser(request: AuthorizedRequest): boolean {
    if (process.env.NODE_ENV !== 'test') return false;
    const configuredId = Number(process.env.LOCAL_TEST_USER_ID);
    const configuredRole = process.env.LOCAL_TEST_USER_ROLE;
    const providedId = request.headers['x-local-test-user-id'];
    if (
      !Number.isSafeInteger(configuredId) ||
      configuredId <= 0 ||
      providedId !== String(configuredId) ||
      (configuredRole !== 'wife' && configuredRole !== 'husband')
    ) {
      return false;
    }
    request.telegramUser = { id: configuredId };
    request.patientRole = configuredRole;
    return true;
  }

  private getAllowedIds(): Set<number> | null {
    const roles = this.getRoles();
    return roles.size > 0 ? new Set(roles.keys()) : null;
  }

  private getRoles(): Map<number, 'wife' | 'husband'> {
    return configuredTelegramRoles();
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      message: 'Invalid or expired Telegram authorization.',
      errorCode: 'INVALID_TELEGRAM_AUTH',
    });
  }
}
