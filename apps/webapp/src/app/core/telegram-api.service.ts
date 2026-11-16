import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id?: number; first_name?: string } };
  ready?: () => void;
  expand?: () => void;
  colorScheme?: 'light' | 'dark';
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export interface HealthResponse {
  appName: string;
  environment: string;
  uptime: number;
}

/** Same-origin API boundary; API keys are injected by the server-side reverse proxy, never by this app. */
@Injectable({ providedIn: 'root' })
export class TelegramApiService {
  private static readonly localTestUserId = '123169226';
  private readonly http = inject(HttpClient);
  private readonly webApp = typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;

  readonly isTelegramWebApp = Boolean(this.webApp?.initData);

  constructor() {
    this.webApp?.ready?.();
    this.webApp?.expand?.();
  }

  firstName(): string | undefined {
    return this.webApp?.initDataUnsafe?.user?.first_name;
  }

  currentUserId(): string | undefined {
    const id = this.webApp?.initDataUnsafe?.user?.id;
    if (Number.isSafeInteger(id)) return String(id);
    const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1'
      ? TelegramApiService.localTestUserId
      : undefined;
  }

  checkHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>('/api/health', { headers: this.authHeaders() });
  }

  /** Provides Telegram's signed payload only in the request header; never persist or log initData. */
  authHeaders(): HttpHeaders {
    const initData = this.webApp?.initData;
    if (initData) return new HttpHeaders({ 'X-Telegram-Init-Data': initData });
    if (this.currentUserId() === TelegramApiService.localTestUserId) {
      return new HttpHeaders({ 'X-Local-Test-User-ID': TelegramApiService.localTestUserId });
    }
    return new HttpHeaders();
  }
}
