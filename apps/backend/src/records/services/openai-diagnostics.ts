/** Allowlist provider metadata suitable for production diagnostics. */
export function safeOpenAIErrorDiagnostics(error: {
  requestID?: unknown;
  status?: unknown;
  code?: unknown;
  error?: unknown;
  param?: unknown;
  model?: unknown;
  elapsedMs?: unknown;
  usage?: unknown;
  output?: unknown;
  stage?: unknown;
}): Record<string, unknown> {
  const body = error.error && typeof error.error === 'object' ? (error.error as Record<string, unknown>) : {};
  const safe = (value: unknown) =>
    typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : undefined;
  return {
    stage: safe(error.stage),
    model: safe(error.model),
    providerRequestId: safe(error.requestID),
    providerStatus: typeof error.status === 'number' ? error.status : undefined,
    providerErrorCode: safe(body.code ?? error.code),
    providerErrorType: safe(body.type),
    providerErrorParam: safe(body.param ?? error.param),
    elapsedMs: typeof error.elapsedMs === 'number' && error.elapsedMs >= 0 ? error.elapsedMs : undefined,
    inputTokens: typeof (error.usage as any)?.input_tokens === 'number' ? (error.usage as any).input_tokens : undefined,
    outputTokens:
      typeof (error.usage as any)?.output_tokens === 'number' ? (error.usage as any).output_tokens : undefined,
    outputItemCount: Array.isArray(error.output) ? error.output.length : undefined,
    outputTypes: Array.isArray(error.output)
      ? [...new Set(error.output.map((x: any) => safe(x?.type)).filter(Boolean))]
      : undefined,
  };
}
