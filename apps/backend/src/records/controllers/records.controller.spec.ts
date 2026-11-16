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
