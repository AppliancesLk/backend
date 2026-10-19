import { GeminiService } from './gemini.service';
import { Logger } from '@nestjs/common';

describe('Gemini transport', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const service = new GeminiService();
  const mockFetch = jest.fn();
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });
  it('preserves signed function-call parts and only declares approved tools', async () => {
    const part = {
      functionCall: { name: 'searchProducts', args: { maxPrice: 100 } },
      thoughtSignature: 'opaque-signature',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [part] } }],
      }),
    });
    expect(
      (
        await service.generate('rules', [
          { role: 'user', parts: [{ text: 'cheaper' }] },
        ])
      ).parts,
    ).toEqual([part]);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).not.toContain('test-key');
    expect(url).toContain('/models/gemini-3.5-flash-lite:generateContent');
    expect(JSON.parse(options.body).generationConfig).not.toHaveProperty(
      'temperature',
    );
    expect(options.headers['x-goog-api-key']).toBe('test-key');
    expect(
      JSON.parse(options.body).tools[0].functionDeclarations.map(
        (tool: { name: string }) => tool.name,
      ),
    ).toEqual([
      'getProductDetails',
      'searchProducts',
      'getRelatedProducts',
      'compareProducts',
    ]);
  });
  it.each([429, 500, 403])(
    'maps provider HTTP %i to a safe error',
    async (status) => {
      mockFetch.mockResolvedValue({ ok: false, status });
      await expect(service.generate('rules', [])).rejects.toMatchObject({
        status: status === 429 ? 429 : 503,
      });
    },
  );
  it('handles network timeouts and invalid responses', async () => {
    mockFetch.mockRejectedValueOnce(new Error('private provider detail'));
    await expect(service.generate('rules', [])).rejects.toThrow(
      'could not respond',
    );
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'MAX_TOKENS',
            content: { parts: [{ text: 'truncated' }] },
          },
        ],
      }),
    });
    await expect(service.generate('rules', [])).rejects.toThrow(
      'could not respond',
    );
  });
  it('fails gracefully when no API key is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(service.generate('rules', [])).rejects.toMatchObject({
      status: 503,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('logs the upstream status and safe reason without keys or context', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      await expect(
        service.generate('private product context', []),
      ).rejects.toMatchObject({ status: 503 });
      expect(warning).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.5-flash-lite',
          providerHttpStatus: 404,
          reason: 'provider_model_unavailable',
        }),
      );
      expect(JSON.stringify(warning.mock.calls)).not.toContain('test-key');
      expect(JSON.stringify(warning.mock.calls)).not.toContain(
        'private product context',
      );
    } finally {
      warning.mockRestore();
    }
  });
});
