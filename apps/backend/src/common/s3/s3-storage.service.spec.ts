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
        $metadata: {
          httpStatusCode: 403,
          requestId: 'aws-req',
          extendedRequestId: 'aws-ext',
          attempts: 2,
          totalRetryDelay: 35,
        },
      });
    });
    const logger = { info: jest.fn(), error: jest.fn() };
    const config = {
      get: (key: string) =>
        (
          ({
            S3_ENDPOINT: 'http://localhost',
            S3_REGION: 'test',
            S3_ACCESS_KEY: 'access',
            S3_SECRET_KEY: 'secret',
            S3_BUCKET: 'bucket',
          }) as Record<string, string>
        )[key],
    };
    const service = new S3StorageService(config as never, logger as never);
    (service as unknown as { s3Client: { send: typeof send } }).s3Client = { send };

    await expect(
      service.uploadFile({ key: raw, body: Buffer.from(raw), contentType: 'application/pdf' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(logger.error).toHaveBeenCalledWith('S3 upload failed', undefined, {
      name: 'S3ServiceException',
      code: 'AccessDenied',
      type: undefined,
      status: 403,
      requestId: 'aws-req',
      extendedRequestId: 'aws-ext',
      cfId: undefined,
      attempts: 2,
      totalRetryDelay: 35,
      cause: {},
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(raw);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('document-content');
  });

  it('logs allowlisted upload response metadata without file data or credentials', async () => {
    const send = jest.fn(async () => ({
      $metadata: { httpStatusCode: 200, requestId: 'req-1', extendedRequestId: 'ext-1', attempts: 1 },
      ETag: '"abc123"',
      VersionId: 'v1',
      ChecksumSHA256: 'abc+/=',
      body: 'private-file-content',
      secretAccessKey: 'private-secret',
    }));
    const logger = { info: jest.fn(), error: jest.fn() };
    const config = {
      get: (key: string) =>
        (
          ({
            S3_ENDPOINT: 'http://localhost',
            S3_REGION: 'test',
            S3_ACCESS_KEY: 'access',
            S3_SECRET_KEY: 'secret',
            S3_BUCKET: 'bucket',
          }) as Record<string, string>
        )[key],
    };
    const service = new S3StorageService(config as never, logger as never);
    (service as unknown as { s3Client: { send: typeof send } }).s3Client = { send };

    await service.uploadFile({
      key: 'private-key',
      body: Buffer.from('private-file-content'),
      contentType: 'application/pdf',
    });
    expect(logger.info).toHaveBeenCalledWith(
      'File uploaded to S3',
      expect.objectContaining({
        status: 200,
        requestId: 'req-1',
        extendedRequestId: 'ext-1',
        etag: '"abc123"',
        versionId: 'v1',
        checksumSHA256: 'abc+/=',
      }),
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/private-file-content|private-secret|private-key/);
  });
});
