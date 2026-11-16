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
      if (status < 500) {
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
        this.logger.error(`${request.method} ${path} → ${status}`, (exception as Error).stack);
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      path,
      message,
      ...(errorCode !== undefined && { errorCode }),
    });
  }
}
