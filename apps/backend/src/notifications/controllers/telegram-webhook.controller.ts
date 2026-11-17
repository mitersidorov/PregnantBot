import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PublicRoute } from '../../auth/decorators/public-route.decorator';
import { ThrottleRoute } from '../../common/throttling/throttle-route.decorator';
import { TelegramWebhookService } from '../services/telegram-webhook.service';

@Controller('webhooks/telegram')
export class TelegramWebhookController {
  constructor(private readonly service: TelegramWebhookService) {}

  @Post()
  @PublicRoute()
  @ThrottleRoute(30, 60000)
  receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Parameters<TelegramWebhookService['handleUpdate']>[1],
  ) {
    return this.service.handleUpdate(secret, update);
  }
}
