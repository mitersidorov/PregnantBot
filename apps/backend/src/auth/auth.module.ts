import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { AuthController } from './controllers/auth.controller';
import { TelegramInitDataGuard } from './guards/telegram-init-data.guard';

// Enforces the shared API key and Telegram identity on every API request.
@Module({
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: TelegramInitDataGuard },
  ],
})
export class AuthModule {}
