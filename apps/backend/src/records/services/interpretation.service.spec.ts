import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { EXTRACTION_INSTRUCTIONS, InterpretationService } from './interpretation.service';

describe('InterpretationService', () => {
  it('validates the provider JSON again with Zod', async () => {
    const service = new InterpretationService();
    (service as unknown as { client: unknown }).client = {
      files: {
        create: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'provider-file' }),
        delete: jest.fn(async () => undefined),
      },
      responses: {
        create: jest.fn<() => Promise<{ output_text: string }>>().mockResolvedValue({
          output_text: JSON.stringify({
            testName: 'CBC',
            resultDate: '2026-01-20',
            summary: 'Normal',
            unexpected: true,
          }),
        }),
      },
    };
    await expect(service.proposeFile(Buffer.from('document'), 'result.pdf', 'application/pdf')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(
      (service as unknown as { client: { files: { delete: jest.Mock } } }).client.files.delete,
    ).toHaveBeenCalledWith('provider-file');
  });

  it('sends Russian-summary instructions while preserving study names and factual values', async () => {
    const providerOutput = {
      testName: 'Complete blood count (CBC)',
      resultDate: '2026-01-20',
      summary: 'Гемоглобин: 132 г/л; лейкоциты: 5,4 × 10⁹/л.',
    };
    const expectedOutput = { ...providerOutput, testName: 'Общий анализ крови' };
    let capturedRequest: Record<string, unknown> | undefined;
    const responsesCreate = jest.fn(async (request: Record<string, unknown>) => {
      capturedRequest = request;
      return { output_text: JSON.stringify(providerOutput) };
    });
    const service = new InterpretationService();
    (service as unknown as { client: unknown }).client = {
      files: {
        create: jest.fn(async () => ({ id: 'provider-file' })),
        delete: jest.fn(async () => undefined),
      },
      responses: { create: responsesCreate },
    };

    await expect(
      service.proposeFile(Buffer.from('synthetic document'), 'result.pdf', 'application/pdf'),
    ).resolves.toEqual(expectedOutput);

    expect(capturedRequest).toMatchObject({
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: EXTRACTION_INSTRUCTIONS },
            { type: 'input_file', file_id: 'provider-file' },
          ],
        },
      ],
    });
    expect(EXTRACTION_INSTRUCTIONS).toContain('по-русски');
    expect(EXTRACTION_INSTRUCTIONS).toContain('Complete blood count (CBC) → Общий анализ крови');
    expect(EXTRACTION_INSTRUCTIONS).toContain('Для неизвестного названия дай точный и понятный перевод');
    expect(EXTRACTION_INSTRUCTIONS).toContain('Для неизвестного названия оставь исходные аббревиатуры');
    expect(EXTRACTION_INSTRUCTIONS).toContain('Не пересчитывай, не округляй, не конвертируй единицы');
  });

  it('does not call OpenAI when credentials are absent', async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const service = new InterpretationService();
      await expect(service.proposeFile(Buffer.from('document'), 'result.pdf', 'application/pdf')).rejects.toMatchObject(
        { status: 503 },
      );
    } finally {
      if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
    }
  });
});
