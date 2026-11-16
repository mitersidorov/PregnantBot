import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '../../common/http/http.service';

@Injectable()
export class TelegramNotificationService {
  constructor(private readonly http: HttpService) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new ServiceUnavailableException('Telegram notifications are not configured.');
    const baseUrl = (process.env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org').replace(/\/+$/, '');
    const response = await this.http.post<{ ok?: boolean }>(`${baseUrl}/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
    if (!response.data?.ok) throw new ServiceUnavailableException('Telegram rejected the notification.');
  }
}
