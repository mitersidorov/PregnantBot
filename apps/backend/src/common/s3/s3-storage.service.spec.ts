import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { S3StorageService } from './s3-storage.service';

describe('S3StorageService', () => {
  it('logs only allowlisted AWS upload diagnostics and never raw error, key, or body', async () => {
    const raw = 'secret-key document-content https://bucket/private/object';
    const send = jest.fn(async () => {
      throw Object.assign(new Error(raw), {
        name: 'S3ServiceException',
        Code: 'AccessDenied',
        $metadata: { httpStatusCode: 403, requestId: 'aws-req', extendedRequestId: 'aws-ext', attempts: 2, totalRetryDelay: 35 },
      });
    });
    const logger = { info: jest.fn(), error: jest.fn() };
    const config = { get: (key: string) => ({
      S3_ENDPOINT: 'http://localhost', S3_REGION: 'test', S3_ACCESS_KEY: 'access',
      S3_SECRET_KEY: 'secret', S3_BUCKET: 'bucket',
    } as Record<string, string>)[key] };
    const service = new S3StorageService(config as never, logger as never);
    (service as unknown as { s3Client: { send: typeof send } }).s3Client = { send };

    await expect(service.uploadFile({ key: raw, body: Buffer.from(raw), contentType: 'application/pdf' }))
      .rejects.toBeInstanceOf(InternalServerErrorException);
    expect(logger.error).toHaveBeenCalledWith('S3 upload failed', {
      errorName: 'S3ServiceException', errorCode: 'AccessDenied', status: 403,
      requestId: 'aws-req', extendedRequestId: 'aws-ext', attempts: 2, totalRetryDelay: 35,
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(raw);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('document-content');
  });
});
