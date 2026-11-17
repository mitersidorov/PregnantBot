import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from '@jest/globals';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PublicRoute, PUBLIC_ROUTE_METADATA } from '../decorators/public-route.decorator';
import { TelegramInitDataGuard } from './telegram-init-data.guard';

describe('PublicRoute guards', () => {
  it('bypasses API key and Telegram initData guards only for explicitly marked handlers', () => {
    class TestController {
      @PublicRoute()
      publicHandler() {
        return undefined;
      }

      privateHandler() {
        return undefined;
      }
    }
    const reflector = new Reflector();
    const apiKey = new ApiKeyGuard(reflector);
    const telegram = new TelegramInitDataGuard(reflector);
    const publicHandler = TestController.prototype.publicHandler;
    const privateHandler = TestController.prototype.privateHandler;
    const execution = (handler: () => undefined) =>
      ({
        getHandler: () => handler,
        getClass: () => TestController,
        switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      }) as unknown as ExecutionContext;

    expect(Reflect.getMetadata(PUBLIC_ROUTE_METADATA, publicHandler)).toBe(true);
    expect(apiKey.canActivate(execution(publicHandler))).toBe(true);
    expect(telegram.canActivate(execution(publicHandler))).toBe(true);
    expect(() => apiKey.canActivate(execution(privateHandler))).toThrow();
    expect(() => telegram.canActivate(execution(privateHandler))).toThrow();
  });
});
