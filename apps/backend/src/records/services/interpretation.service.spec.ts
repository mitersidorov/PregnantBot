import { BadGatewayException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { EXTRACTION_INSTRUCTIONS, InterpretationService, extractionInstructionsFor } from './interpretation.service';

const completedResponse = (output_text: string, extras: Record<string, unknown> = {}) => ({
  output_text,
  output: [],
  status: 'completed',
  ...extras,
});

describe('InterpretationService', () => {
  it('validates the provider JSON again with Zod', async () => {
    const service = new InterpretationService();
    (service as unknown as { client: unknown }).client = {
      files: {
        create: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'provider-file' }),
        delete: jest.fn(async () => undefined),
      },
      responses: {
        create: jest.fn<() => Promise<{ output_text: string }>>().mockResolvedValue(
          completedResponse(
            JSON.stringify({
              findings: [
                { testName: 'CBC', resultDate: '2026-01-20', summary: 'Normal', pageNumber: 1, requirementIds: [] },
              ],
              unexpected: true,
            }),
          ),
        ),
      },
    };
    await expect(service.proposeFile(Buffer.from('document'), 'result.pdf', 'application/pdf')).rejects.toBeInstanceOf(
      BadGatewayException,
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
      return completedResponse(JSON.stringify(providerOutput));
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
          return completedResponse(JSON.stringify(providerOutput));
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

  it('includes explicit Georgian, Russian, English, and mixed-language recognition guidance', () => {
    expect(EXTRACTION_INSTRUCTIONS).toContain('русском, грузинском');
    expect(EXTRACTION_INSTRUCTIONS).toContain('грузинские названия медицинских исследований');
    expect(EXTRACTION_INSTRUCTIONS).toContain('Не теряй исходные аббревиатуры и коды');
    expect(extractionInstructionsFor([{ id: 'wife-cbc', name: 'Complete blood count (CBC)' }])).toContain(
      'только когда исследование явно соответствует этому пункту',
    );
  });

  it('accepts a valid empty findings array as a successful extraction', async () => {
    const service = new InterpretationService();
    (service as unknown as { client: unknown }).client = {
      files: {
        create: jest.fn(async () => ({ id: 'provider-file' })),
        delete: jest.fn(async () => undefined),
      },
      responses: { create: jest.fn(async () => completedResponse('{"findings":[]}')) },
    };

    await expect(service.proposeFile(Buffer.from('document'), 'result.pdf', 'application/pdf')).resolves.toMatchObject({
      findings: [],
      testName: null,
      resultDate: null,
      summary: null,
    });
  });

  it.each([
    {
      title: 'provider refusal',
      response: completedResponse('', {
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'not logged' }] }],
      }),
      code: 'INTERPRETATION_RETRYABLE',
    },
    {
      title: 'empty completed response',
      response: completedResponse(''),
      code: 'INTERPRETATION_RETRYABLE',
    },
    {
      title: 'incomplete response',
      response: completedResponse('', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
      code: 'INTERPRETATION_RETRYABLE',
    },
    {
      title: 'malformed JSON',
      response: completedResponse('{invalid'),
      code: 'INTERPRETATION_INVALID_OUTPUT',
    },
    {
      title: 'schema-invalid JSON',
      response: completedResponse('{"findings":[{"unexpected":true}]}'),
      code: 'INTERPRETATION_INVALID_OUTPUT',
    },
  ])('returns a safe explicit error for $title', async ({ response, code }) => {
    const service = new InterpretationService();
    (service as unknown as { client: unknown }).client = {
      files: {
        create: jest.fn(async () => ({ id: 'provider-file' })),
        delete: jest.fn(async () => undefined),
      },
      responses: { create: jest.fn(async () => response) },
    };

    await expect(service.proposeFile(Buffer.from('document'), 'result.pdf', 'application/pdf')).rejects.toMatchObject({
      response: { errorCode: code },
    });
  });
});
