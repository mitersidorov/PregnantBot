import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { LoggingService } from '../logging/logging.service';

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
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: metadata,
        }),
      );
      this.logger.info('File uploaded to S3');
    } catch {
      this.logger.error('S3 upload failed');
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      this.logger.info('File deleted from S3');
    } catch {
      this.logger.error('S3 delete failed');
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) throw new Error('Empty S3 object');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch {
      this.logger.error('S3 download failed');
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }

  async downloadFileStream(key: string): Promise<Readable> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) throw new Error('Empty S3 object');
      return Readable.fromWeb(result.Body.transformToWebStream() as never);
    } catch {
      this.logger.error('S3 download failed');
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
    } catch {
      this.logger.error('S3 signed URL generation failed');
      throw new InternalServerErrorException({ message: 'S3 storage operation failed.', errorCode: 'S3_ERROR' });
    }
  }
}
