import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '../common/http/http.module';
import { Cycle } from '../cycles/entities/cycle.entity';
import { MedicalResult } from '../records/entities/medical-result.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { TelegramWebhookController } from './controllers/telegram-webhook.controller';
import { NotificationSchedulerService } from './services/notification-scheduler.service';
import { TelegramNotificationService } from './services/telegram-notification.service';
import { TelegramWebhookService } from './services/telegram-webhook.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cycle, MedicalResult, NotificationDelivery]), HttpModule],
  controllers: [TelegramWebhookController],
  providers: [NotificationSchedulerService, TelegramNotificationService, TelegramWebhookService],
  exports: [NotificationSchedulerService, TelegramNotificationService],
})
export class NotificationsModule {}
