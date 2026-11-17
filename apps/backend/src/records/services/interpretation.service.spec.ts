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
            findings: [
              { testName: 'CBC', resultDate: '2026-01-20', summary: 'Normal', pageNumber: 1, requirementIds: [] },
            ],
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
      findings: [
        {
          testName: 'Complete blood count (CBC)',
          resultDate: '2026-01-20',
          summary: 'Гемоглобин: 132 г/л; лейкоциты: 5,4 × 10⁹/л.',
          pageNumber: 1,
          requirementIds: ['h-cbc'],
        },
      ],
    };
    const expectedFinding = { ...providerOutput.findings[0], testName: 'Общий анализ крови' };
    const expectedOutput = { ...expectedFinding, findings: [expectedFinding] };
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
      service.proposeFile(Buffer.from('synthetic document'), 'result.pdf', 'application/pdf', [
        { id: 'h-cbc', name: 'Complete blood count (CBC)' },
      ]),
    ).resolves.toEqual(expectedOutput);

    expect(capturedRequest).toMatchObject({
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: expect.stringContaining('h-cbc: Complete blood count (CBC)') },
            { type: 'input_file', file_id: 'provider-file', detail: 'high' },
          ],
        },
      ],
    });
    expect(EXTRACTION_INSTRUCTIONS).toContain('по-русски');
    expect(EXTRACTION_INSTRUCTIONS).not.toContain('Complete blood count (CBC) → Общий анализ крови');
    expect(EXTRACTION_INSTRUCTIONS).toContain('Для неизвестного названия оставь исходные аббревиатуры');
    expect(EXTRACTION_INSTRUCTIONS).toContain('Не пересчитывай, не округляй, не конвертируй единицы');
    expect(EXTRACTION_INSTRUCTIONS).toContain('от первой до последней страницы');
    const input = capturedRequest?.input as Array<{ content: Array<Record<string, unknown>> }>;
    const prompt = input[0].content.find((part) => part.type === 'input_text')?.text as string;
    expect(prompt).toContain('h-cbc: Complete blood count (CBC)');
    expect(prompt).not.toContain('wife-urine');
    expect(prompt).not.toContain('Urinalysis');
  });

  it('returns every distinct finding and projects the first finding into legacy fields', async () => {
    const providerOutput = {
      findings: [
        {
          testName: 'Complete blood count (CBC)',
          resultDate: '2026-01-20',
          summary: 'Гемоглобин: 132 г/л.',
          pageNumber: 1,
          requirementIds: [],
        },
        {
          testName: 'Urinalysis',
          resultDate: '2026-01-21',
          summary: 'Белок: отрицательно.',
          pageNumber: 2,
          requirementIds: [],
        },
      ],
    };
    let capturedRequest: Record<string, unknown> | undefined;
    const service = new InterpretationService();
    (service as unknown as { client: unknown }).client = {
      files: {
        create: jest.fn(async () => ({ id: 'provider-file' })),
        delete: jest.fn(async () => undefined),
      },
      responses: {
        create: jest.fn(async (request: Record<string, unknown>) => {
          capturedRequest = request;
          return { output_text: JSON.stringify(providerOutput) };
        }),
      },
    };

    await expect(
      service.proposeFile(Buffer.from('%PDF-synthetic'), 'multi-page.pdf', 'application/pdf'),
    ).resolves.toEqual({
      testName: 'Общий анализ крови',
      resultDate: '2026-01-20',
      summary: 'Гемоглобин: 132 г/л.',
      pageNumber: 1,
      requirementIds: [],
      findings: [
        {
          testName: 'Общий анализ крови',
          resultDate: '2026-01-20',
          summary: 'Гемоглобин: 132 г/л.',
          pageNumber: 1,
          requirementIds: [],
        },
        {
          testName: 'Общий анализ мочи',
          resultDate: '2026-01-21',
          summary: 'Белок: отрицательно.',
          pageNumber: 2,
          requirementIds: [],
        },
      ],
    });

    expect(capturedRequest).toMatchObject({
      text: {
        format: {
          schema: {
            properties: {
              findings: {
                type: 'array',
                items: { required: ['testName', 'resultDate', 'summary', 'pageNumber', 'requirementIds'] },
              },
            },
            required: ['findings'],
          },
        },
      },
    });
    const input = capturedRequest?.input as Array<{ content: Array<Record<string, unknown>> }>;
    expect(input[0].content).toContainEqual({ type: 'input_file', file_id: 'provider-file', detail: 'high' });
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
