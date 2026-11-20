import { describe, expect, it } from '@jest/globals';
import { safeOpenAIErrorDiagnostics } from './openai-diagnostics';

describe('safeOpenAIErrorDiagnostics', () => {
  it('keeps allowlisted metadata and drops sensitive provider data', () => {
    expect(
      safeOpenAIErrorDiagnostics({
        requestID: 'req_123',
        status: 400,
        code: 'invalid_request',
        error: { type: 'bad_request', message: 'secret sk-abc' },
      }),
    ).toEqual({
      providerRequestId: 'req_123',
      providerStatus: 400,
      providerErrorCode: 'invalid_request',
      providerErrorType: 'bad_request',
    });
    expect(
      JSON.stringify(safeOpenAIErrorDiagnostics({ requestID: 'Bearer token', error: { message: 'patient data' } })),
    ).not.toMatch(/Bearer|patient|token/);
  });
});
