import { Injectable } from '@nestjs/common';
import { LoggingService } from '../logging/logging.service';
import { HttpRequestOptions } from './http-request-options.interface';
import { HttpResponse } from './http-response.interface';

@Injectable()
export class HttpService {
  private readonly defaultTimeout: number;
  private readonly defaultRetries: number;
  private readonly defaultRetryDelay: number;

  constructor(private readonly logger: LoggingService) {
    this.defaultTimeout = Number(process.env.HTTP_TIMEOUT_MS || 10000);
    this.defaultRetries = Number(process.env.HTTP_RETRIES || 3);
    this.defaultRetryDelay = Number(process.env.HTTP_RETRY_DELAY_MS || 1000);
    if (!Number.isSafeInteger(this.defaultTimeout) || this.defaultTimeout <= 0)
      throw new Error('HTTP_TIMEOUT_MS must be a positive integer.');
    if (!Number.isSafeInteger(this.defaultRetries) || this.defaultRetries < 0)
      throw new Error('HTTP_RETRIES must be a non-negative integer.');
    if (!Number.isSafeInteger(this.defaultRetryDelay) || this.defaultRetryDelay < 0)
      throw new Error('HTTP_RETRY_DELAY_MS must be a non-negative integer.');
  }

  async request<T = any>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const {
      method,
      url,
      headers = {},
      body,
      timeout = this.defaultTimeout,
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
    } = options;

    let lastError: Error | null = null;
    const safeToRetry = method === 'GET';
    const retryLimit = safeToRetry ? retries : 0;
    if (
      !Number.isSafeInteger(timeout) ||
      timeout <= 0 ||
      !Number.isSafeInteger(retries) ||
      retries < 0 ||
      !Number.isSafeInteger(retryDelay) ||
      retryDelay < 0
    ) {
      throw new Error(
        'HTTP request timeout, retry count, and retry delay must be valid non-negative integers (timeout must be positive).',
      );
    }
    const safeUrl = (() => {
      try {
        const parsed = new URL(url);
        return parsed.origin;
      } catch {
        return '[invalid URL]';
      }
    })();
    const operation = (() => {
      try {
        const path = new URL(url).pathname;
        if (path.endsWith('/sendMessage')) return 'telegram.sendMessage';
        if (path.endsWith('/setWebhook')) return 'telegram.setWebhook';
      } catch {
        return undefined;
      }
      return undefined;
    })();

    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: controller.signal,
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        const responseText = await response.text();
        let responseData: unknown = undefined;
        if (responseText) {
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = responseText;
          }
        }

        const result: HttpResponse<T> = {
          status: response.status,
          data: responseData as T,
          headers: Object.fromEntries(response.headers.entries()),
        };

        if (!response.ok) {
          if (!safeToRetry || (response.status < 500 && response.status !== 429) || attempt === retryLimit) {
            throw new NonRetryableHttpError(`External HTTP request failed with status ${response.status}`);
          }
          throw new RetryableHttpError(`External HTTP request failed with status ${response.status}`);
        }

        if (attempt > 0) {
          this.logger.info(`HTTP request succeeded after ${attempt} retries`, { url: safeUrl });
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        const isLastAttempt = attempt === retryLimit || error instanceof NonRetryableHttpError;

        if (isLastAttempt) {
          const cause = error instanceof Error ? error.cause : undefined;
          const causeCode = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
          this.logger.error('External HTTP request failed', undefined, {
            url: safeUrl,
            method,
            attempts: attempt + 1,
            ...(operation ? { operation } : {}),
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessage: error instanceof Error ? error.message.slice(0, 160) : 'Unknown error',
            ...(causeCode ? { causeCode } : {}),
          });
          throw lastError;
        } else {
          this.logger.info(`HTTP request failed, retrying (${attempt + 1}/${retryLimit})`, {
            url: safeUrl,
          });
          await this.delay(retryDelay * (attempt + 1));
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }

  async get<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, headers });
  }

  async post<T = any>(url: string, body: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', url, body, headers });
  }

  async put<T = any>(url: string, body: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', url, body, headers });
  }

  async patch<T = any>(url: string, body: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, body, headers });
  }

  async delete<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', url, headers });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class RetryableHttpError extends Error {}
class NonRetryableHttpError extends Error {}
