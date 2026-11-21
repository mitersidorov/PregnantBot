import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { LoggingService } from '../logging/logging.service';

// Allowlist SDK diagnostics; never serialize raw responses, requests, or provider errors.
const safeText = (value: unknown) =>
  typeof value === 'string' &&
  value.length <= 160 &&
  /^[\w .,:;()'-]+$/.test(value) &&
  !/authorization|credential|secret|signature|token|password/i.test(value)
    ? value
    : undefined;
const safeId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_.:+=/"-]{1,160}$/.test(value) ? value : undefined;
function s3Metadata(value: unknown): Record<string, unknown> {
  const metadata =
    value && typeof value === 'object' && '$metadata' in value && value.$metadata && typeof value.$metadata === 'object'
      ? (value.$metadata as Record<string, unknown>)
      : {};
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  return {
    status: number(metadata.httpStatusCode),
    requestId: safeId(metadata.requestId),
    extendedRequestId: safeId(metadata.extendedRequestId),
    cfId: safeId(metadata.cfId),
    attempts: number(metadata.attempts),
    totalRetryDelay: number(metadata.totalRetryDelay),
  };
}
function s3ErrorDetails(error: unknown): Record<string, unknown> {
  const extract = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object') return {};
    const e = value as Record<string, unknown>;
    return {
      name: safeText(e.name),
      code: safeText(e.Code ?? e.code),
      type: safeText(e.$fault),
      ...s3Metadata(value),
    };
  };
  const e = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return { ...extract(error), cause: extract(e.cause) };
}

function s3UploadDetails(value: unknown): Record<string, unknown> {
  const response = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    ...s3Metadata(value),
    etag: safeId(response.ETag),
    versionId: safeId(response.VersionId),
    checksumCRC32: safeId(response.ChecksumCRC32),
    checksumCRC32C: safeId(response.ChecksumCRC32C),
    checksumCRC64NVME: safeId(response.ChecksumCRC64NVME),
    checksumSHA1: safeId(response.ChecksumSHA1),
    checksumSHA256: safeId(response.ChecksumSHA256),
  };
}

@Injectable()
export class S3StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggingService,
  ) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const region = this.configService.get<string>('S3_REGION');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY');
    const forcePathStyle = this.configService.get<string>('S3_FORCE_PATH_STYLE') === 'true';

    this.bucket = this.configService.get<string>('S3_BUCKET') ?? '';

    if (
      !accessKeyId?.trim() ||
      !secretAccessKey?.trim() ||
      !endpoint?.trim() ||
      !region?.trim() ||
      !this.bucket.trim()
    ) {
      throw new Error('S3 endpoint, region, bucket, and credentials must be configured.');
    }

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    });

    this.logger.info('S3 client initialized', { region });
  }

  async uploadFile(params: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const { key, body, contentType, metadata } = params;

    try {
      const response = await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: metadata,
        }),
      );
      this.logger.info('File uploaded to S3', s3UploadDetails(response));
    } catch (error) {
      this.logger.error('S3 upload failed', undefined, s3ErrorDetails(error));
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      this.logger.info('File deleted from S3');
    } catch (error) {
      this.logger.error('S3 delete failed', undefined, s3ErrorDetails(error));
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) throw new Error('Empty S3 object');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      this.logger.error('S3 download failed', undefined, s3ErrorDetails(error));
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }

  async downloadFileStream(key: string): Promise<Readable> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) throw new Error('Empty S3 object');
      return Readable.fromWeb(result.Body.transformToWebStream() as never);
    } catch (error) {
      this.logger.error('S3 download failed', undefined, s3ErrorDetails(error));
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }

  async createDownloadUrl(key: string, fileName: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, '_')}"`,
        }),
        { expiresIn: 60 },
      );
    } catch (error) {
      this.logger.error('S3 signed URL generation failed', undefined, s3ErrorDetails(error));
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }
}
