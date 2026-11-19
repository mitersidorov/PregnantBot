import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

function statusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    500: 'INTERNAL_ERROR',
  };
  return map[status] ?? 'UNKNOWN_ERROR';
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const path = request.path;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (status < 500 || this.isSafeInterpretationError(res)) {
        if (typeof res === 'string') {
          message = res;
        } else {
          const body = res as { message?: unknown; errorCode?: unknown };
          message =
            typeof body.message === 'string'
              ? body.message
              : Array.isArray(body.message)
                ? 'Validation failed'
                : message;
          errorCode = typeof body.errorCode === 'string' ? body.errorCode : statusToCode(status);
        }
      } else {
        errorCode = statusToCode(status);
      }
      if (status >= 500) {
        this.logger.error(`${request.method} ${path} → ${status} code=${errorCode ?? 'INTERNAL_ERROR'}`);
      }
    } else {
      this.logger.error(`Unhandled exception on ${request.method} ${path} type=${exceptionType(exception)}`);
    }

    response.status(status).json({
      statusCode: status,
      path,
      message,
      ...(errorCode !== undefined && { errorCode }),
    });
  }

  private isSafeInterpretationError(response: string | object): boolean {
    if (typeof response !== 'object' || response === null) return false;
    const body = response as { errorCode?: unknown; message?: unknown };
    return (
      typeof body.message === 'string' &&
      ['INTERPRETATION_RETRYABLE', 'INTERPRETATION_INVALID_OUTPUT'].includes(String(body.errorCode))
    );
  }
}

function exceptionType(exception: unknown): string {
  return exception instanceof Error ? exception.name : typeof exception;
}
