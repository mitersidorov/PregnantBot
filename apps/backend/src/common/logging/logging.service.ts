import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LoggingService {
  private readonly logger: Logger;

  constructor(context: string = 'App') {
    this.logger = new Logger(context);
  }

  info(message: string, meta?: any) {
    this.logger.log(meta ? `${message} ${JSON.stringify(this.redact(meta))}` : message);
  }

  error(message: string, error?: any, meta?: any) {
    const details = meta ?? (error && !(error instanceof Error) ? error : undefined);
    const base = details ? `${message} ${JSON.stringify(this.redact(details))}` : message;
    this.logger.error(base, error instanceof Error ? error.stack : undefined);
  }

  warn(message: string, meta?: any) {
    this.logger.warn(meta ? `${message} ${JSON.stringify(this.redact(meta))}` : message);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(meta ? `${message} ${JSON.stringify(this.redact(meta))}` : message);
  }

  private redact(value: any): any {
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|api[-_]?key|token|secret|password|credential|initdata|medical|document|body/i.test(key)
          ? '[REDACTED]'
          : this.redact(item),
      ]),
    );
  }
}
