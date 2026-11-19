import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { AppExceptionFilter } from './app-exception.filter';

function responseFor(exception: Error) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const filter = new AppExceptionFilter();
  filter.catch(exception, {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ path: '/records/results/id/interpret', method: 'POST' }),
    }),
  } as never);
  return { status, json };
}

describe('AppExceptionFilter interpretation errors', () => {
  it('exposes only allowlisted retryable interpretation message and code', () => {
    const { status, json } = responseFor(
      new ServiceUnavailableException({
        message: 'The document could not be interpreted. Please try again.',
        errorCode: 'INTERPRETATION_RETRYABLE',
      }),
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The document could not be interpreted. Please try again.',
        errorCode: 'INTERPRETATION_RETRYABLE',
      }),
    );
  });

  it('exposes the safe invalid-output code but still hides unrelated provider errors', () => {
    const allowed = responseFor(
      new BadGatewayException({
        message: 'The interpretation response was invalid. Please try again.',
        errorCode: 'INTERPRETATION_INVALID_OUTPUT',
      }),
    );
    const hidden = responseFor(
      new ServiceUnavailableException({ message: 'provider secret', errorCode: 'OPENAI_ERROR' }),
    );

    expect(allowed.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'INTERPRETATION_INVALID_OUTPUT' }));
    expect(hidden.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'SERVICE_UNAVAILABLE' }));
    expect(hidden.json).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'provider secret' }));
  });
});
