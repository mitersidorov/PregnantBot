import { Logger } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { LoggingService } from './logging.service';

describe('LoggingService', () => {
  it('writes structured error metadata and redacts sensitive fields', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      new LoggingService('S3').error('S3 upload failed', undefined, {
        status: 403,
        requestId: 'request-1',
        secretAccessKey: 'private',
      });
      expect(log).toHaveBeenCalledWith(
        'S3 upload failed {"status":403,"requestId":"request-1","secretAccessKey":"[REDACTED]"}',
        undefined,
      );
    } finally {
      log.mockRestore();
    }
  });

  it('writes upload success metadata', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      new LoggingService('S3').info('File uploaded to S3', { status: 200, requestId: 'req-1', etag: '"abc"' });
      expect(log).toHaveBeenCalledWith('File uploaded to S3 {"status":200,"requestId":"req-1","etag":"\\"abc\\""}');
    } finally {
      log.mockRestore();
    }
  });
});
