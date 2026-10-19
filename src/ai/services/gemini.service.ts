import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AI_FUNCTION_DECLARATIONS } from '../ai.constants';
import type { GeminiContent, GeminiPart } from '../types/ai.types';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validPart(value: unknown): value is GeminiPart {
  if (!object(value)) return false;
  if (
    value.thoughtSignature !== undefined &&
    typeof value.thoughtSignature !== 'string'
  )
    return false;
  if (value.thought !== undefined && typeof value.thought !== 'boolean')
    return false;
  if (typeof value.text === 'string')
    return value.text.length <= 16000 && value.functionCall === undefined;
  const call = value.functionCall;
  return (
    object(call) &&
    typeof call.name === 'string' &&
    call.name.length <= 80 &&
    (call.id === undefined || typeof call.id === 'string') &&
    (call.args === undefined || object(call.args))
  );
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  async generate(
    systemInstruction: string,
    contents: GeminiContent[],
  ): Promise<GeminiContent> {
    const started = Date.now();
    const key = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
    let failureReason = 'network_error';
    let providerHttpStatus: number | undefined;
    try {
      if (!key || !/^[a-zA-Z0-9.-]+$/.test(model)) {
        failureReason = 'invalid_configuration';
        throw new ServiceUnavailableException(
          'The product assistant is temporarily unavailable. Please try again later',
        );
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            tools: [{ functionDeclarations: AI_FUNCTION_DECLARATIONS }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            generationConfig: {
              // Gemini 3.5+ rejects the deprecated sampling parameters.
              ...(model.startsWith('gemini-2.') ? { temperature: 0.1 } : {}),
              maxOutputTokens: 1600,
            },
          }),
        },
      );
      providerHttpStatus = response.status;
      if (response.status === 429) {
        failureReason = 'provider_quota';
        throw new HttpException(
          'The product assistant is busy. Please try again in a minute',
          429,
        );
      }
      if (!response.ok) {
        failureReason =
          response.status === 404
            ? 'provider_model_unavailable'
            : [401, 403].includes(response.status)
              ? 'provider_authentication'
              : response.status === 400
                ? 'provider_request_rejected'
                : 'provider_unavailable';
        throw new ServiceUnavailableException(
          'The product assistant is temporarily unavailable. Please try again',
        );
      }
      failureReason = 'invalid_provider_response';
      const data: unknown = await response.json();
      if (!object(data) || !Array.isArray(data.candidates))
        throw new Error('Invalid provider response');
      const candidate: unknown = data.candidates[0];
      if (
        !object(candidate) ||
        candidate.finishReason !== 'STOP' ||
        !object(candidate.content)
      ) {
        if (object(candidate) && candidate.finishReason === 'MAX_TOKENS')
          failureReason = 'provider_output_limit';
        else if (object(candidate) && candidate.finishReason === 'SAFETY')
          failureReason = 'provider_safety_block';
        throw new Error('Incomplete provider response');
      }
      const parts = candidate.content.parts;
      if (
        !Array.isArray(parts) ||
        !parts.length ||
        parts.length > 12 ||
        !parts.every(validPart)
      )
        throw new Error('Invalid provider parts');
      this.logger.log({
        operation: 'ai.gemini.completed',
        model,
        durationMs: Date.now() - started,
      });
      // Keep original parts, including signatures; never reconstruct function-call parts.
      return { role: 'model', parts };
    } catch (error) {
      this.logger.warn({
        operation: 'ai.gemini.failed',
        model: /^[a-zA-Z0-9.-]+$/.test(model) ? model : 'invalid',
        reason:
          error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'provider_timeout'
            : failureReason,
        providerHttpStatus,
        durationMs: Date.now() - started,
        statusCode: error instanceof HttpException ? error.getStatus() : 503,
      });
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'The product assistant could not respond. Please try again',
      );
    }
  }
}
