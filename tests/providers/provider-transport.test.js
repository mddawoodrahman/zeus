const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeMockResponse(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k) => headers[k] || null
    },
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data))
  };
}

function makeStreamResponse(chunks, status = 200) {
  let index = 0;
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
      } else {
        controller.close();
      }
    }
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: readable,
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => chunks.join('')
  };
}

describe('ProviderTransport Engine (Ticket 03A)', () => {
  beforeEach(() => {
    clearZeusGlobals();
    globalThis.fetch = vi.fn();

    loadScript('core/retry.js');
    loadScript('core/errors.js');
    loadScript('core/providerTransport.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  describe('Unary execute() Interface', () => {
    it('executes successful request with JSON payload', async () => {
      const transport = globalThis.ZeusProviderTransport;
      globalThis.fetch.mockResolvedValueOnce(
        makeMockResponse(200, { result: 'ok', text: 'enhanced output' })
      );

      const res = await transport.execute({
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-key' },
        body: { model: 'gpt-4o', prompt: 'test' }
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(res.data.text).toBe('enhanced output');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('retries on pre-first-byte transient status (429, 500) and recovers', async () => {
      const transport = globalThis.ZeusProviderTransport;
      globalThis.fetch
        .mockResolvedValueOnce(makeMockResponse(429, { error: { message: 'Rate limit' } }))
        .mockResolvedValueOnce(makeMockResponse(503, { error: { message: 'Service unavailable' } }))
        .mockResolvedValueOnce(makeMockResponse(200, { success: true }));

      const res = await transport.execute({
        url: 'https://api.openai.com/v1/chat/completions',
        maxRetries: 3
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('does not retry when signal is aborted before or during execution', async () => {
      const transport = globalThis.ZeusProviderTransport;
      const controller = new AbortController();
      controller.abort();

      await expect(
        transport.execute({
          url: 'https://api.openai.com/v1/chat/completions',
          signal: controller.signal,
          maxRetries: 3
        })
      ).rejects.toThrow(/aborted/i);

      expect(globalThis.fetch).toHaveBeenCalledTimes(0);
    });
  });

  describe('Streaming stream() Interface & Decoders', () => {
    it('decodes Server-Sent Events (SSE) stream frames correctly', async () => {
      const transport = globalThis.ZeusProviderTransport;
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n'
      ];

      globalThis.fetch.mockResolvedValueOnce(makeStreamResponse(sseChunks));

      const received = [];
      await transport.stream({
        url: 'https://api.openai.com/v1/chat/completions',
        decoder: 'sse'
      }, {
        onChunk: (chunk) => {
          received.push(chunk?.choices?.[0]?.delta?.content);
        }
      });

      expect(received).toEqual(['Hello', ' world']);
    });

    it('decodes Newline-Delimited JSON (NDJSON) stream frames correctly (Ollama protocol)', async () => {
      const transport = globalThis.ZeusProviderTransport;
      const ndjsonChunks = [
        '{"model":"qwen3:8b","response":"Thinking","done":false}\n',
        '{"model":"qwen3:8b","response":" complete","done":true}\n'
      ];

      globalThis.fetch.mockResolvedValueOnce(makeStreamResponse(ndjsonChunks));

      const received = [];
      await transport.stream({
        url: 'http://localhost:11434/api/generate',
        decoder: 'ndjson'
      }, {
        onChunk: (chunk) => {
          received.push(chunk?.response);
        }
      });

      expect(received).toEqual(['Thinking', ' complete']);
    });

    it('retries on pre-first-byte transient failure before stream begins', async () => {
      const transport = globalThis.ZeusProviderTransport;
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Recovered stream"}}]}\n\n',
        'data: [DONE]\n\n'
      ];

      globalThis.fetch
        .mockResolvedValueOnce(makeMockResponse(502, { error: 'Bad Gateway' }))
        .mockResolvedValueOnce(makeStreamResponse(sseChunks));

      const received = [];
      await transport.stream({
        url: 'https://api.openai.com/v1/chat/completions',
        decoder: 'sse',
        maxRetries: 3
      }, {
        onChunk: (chunk) => {
          received.push(chunk?.choices?.[0]?.delta?.content);
        }
      });

      expect(received).toEqual(['Recovered stream']);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('ENFORCES RETRY INVARIANT: NEVER retries after the first chunk has been emitted', async () => {
      const transport = globalThis.ZeusProviderTransport;
      const encoder = new TextEncoder();

      // Create a stream that emits one valid chunk, then throws a network/read error
      let count = 0;
      const failingStream = new ReadableStream({
        pull(controller) {
          if (count === 0) {
            count += 1;
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"First chunk"}}]}\n\n'));
          } else {
            controller.error(new Error('Connection terminated mid-stream'));
          }
        }
      });

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: failingStream,
        headers: { get: () => null }
      });

      const received = [];
      await expect(
        transport.stream({
          url: 'https://api.openai.com/v1/chat/completions',
          decoder: 'sse',
          maxRetries: 3
        }, {
          onChunk: (chunk) => {
            received.push(chunk?.choices?.[0]?.delta?.content);
          }
        })
      ).rejects.toThrow('Connection terminated mid-stream');

      // Crucial assertion: First chunk was emitted, so fetch was called ONLY once (no retry after first byte)
      expect(received).toEqual(['First chunk']);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('exposes standalone text decoders decodeSseText and decodeNdjsonText', () => {
      const transport = globalThis.ZeusProviderTransport;

      const sseReceived = [];
      transport.decodeSseText('data: {"val": 1}\n\ndata: [DONE]\n', (c) => sseReceived.push(c.val));
      expect(sseReceived).toEqual([1]);

      const ndjsonReceived = [];
      transport.decodeNdjsonText('{"val": 2}\n{"val": 3}\n', (c) => ndjsonReceived.push(c.val));
      expect(ndjsonReceived).toEqual([2, 3]);
    });
  });
});
