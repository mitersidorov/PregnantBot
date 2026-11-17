import { describe, expect, it, jest } from '@jest/globals';
import { RecordsController } from './records.controller';

describe('RecordsController download', () => {
  it('streams file bytes with authenticated same-origin headers and no redirect', async () => {
    const stream = { pipe: jest.fn() };
    const controller = new RecordsController({
      downloadStream: jest.fn(async () => ({
        file: { originalName: 'result report.pdf', contentType: 'application/pdf' },
        stream,
      })),
    } as never);
    const response = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    };

    await controller.download('file-id', response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining("filename*=UTF-8''result%20report.pdf"),
      }),
    );
    expect(stream.pipe).toHaveBeenCalledWith(response);
    expect(response.redirect).not.toHaveBeenCalled();
  });
});

describe('RecordsController interpretation', () => {
  it('passes the authenticated uploader ID while matching checklist findings independently of role', async () => {
    const service = {
      interpret: jest.fn(async (id: string, userId: number, role: string) => {
        void id;
        void userId;
        void role;
        return { id: 'result-id' };
      }),
    };
    const controller = new RecordsController(service as never);

    await controller.interpret('result-id', {
      telegramUser: { id: 101 },
      patientRole: 'wife',
    } as never);

    expect(service.interpret).toHaveBeenCalledWith('result-id', 101, 'wife');
  });
});

describe('RecordsController throttling metadata', () => {
  it('limits uploads to 10/minute and interpretation to 5/minute', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', RecordsController.prototype.upload)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', RecordsController.prototype.upload)).toBe(60000);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', RecordsController.prototype.interpret)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', RecordsController.prototype.interpret)).toBe(60000);
  });
});
