const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusRetry.fetchWithTimeout', () => {
  beforeEach(() => {
    clearZeusGlobals();
    globalThis.fetch = vi.fn();
    loadScript('core/retry.js');
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  function mockFetch() {
    globalThis.fetch.mockImplementation((_url, options) => new Promise((resolve, reject) => {
      const signal = options?.signal;
      if (!signal) {
        resolve({ ok: true });
        return;
      }

      if (signal.aborted) {
        reject(signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        return;
      }

      signal.addEventListener('abort', () => {
        reject(signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      }, { once: true });
    }));
  }

  it('rejects once the configured timeout elapses', async () => {
    vi.useFakeTimers();
    mockFetch();

    const pending = globalThis.ZeusRetry.fetchWithTimeout('https://example.test/api', { method: 'POST' }, 1000);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(1200);
    await assertion;
  });

  it('forwards an already-aborted caller signal to fetch', async () => {
    mockFetch();

    const controller = new AbortController();
    controller.abort();

    await expect(
      globalThis.ZeusRetry.fetchWithTimeout('https://example.test/api', { signal: controller.signal }, 5000)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels in-flight work when the caller aborts before the timeout', async () => {
    mockFetch();

    const controller = new AbortController();
    const pending = globalThis.ZeusRetry.fetchWithTimeout(
      'https://example.test/api',
      { signal: controller.signal },
      30000
    );
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await assertion;
  });

  it('still succeeds when the caller signal never aborts', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true });

    const controller = new AbortController();
    const response = await globalThis.ZeusRetry.fetchWithTimeout(
      'https://example.test/api',
      { signal: controller.signal },
      5000
    );

    expect(response).toEqual({ ok: true });

    // A live, un-aborted signal must be forwarded rather than dropped.
    const forwardedSignal = globalThis.fetch.mock.calls[0][1].signal;
    expect(forwardedSignal).toBeTruthy();
    expect(forwardedSignal.aborted).toBe(false);
  });

  it('applies a default timeout when none is supplied', () => {
    expect(globalThis.ZeusRetry.DEFAULT_FETCH_TIMEOUT_MS).toBe(20000);
  });
});
