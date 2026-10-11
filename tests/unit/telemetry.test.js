const { createChromeMock } = require('../mocks/chrome');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

const STORAGE_KEY = 'zeus_fallback_telemetry';

describe('ZeusTelemetry', () => {
  let env;

  beforeEach(() => {
    clearZeusGlobals();
    vi.useFakeTimers();
    env = createChromeMock();
    globalThis.chrome = env.chrome;
    loadScript('core/telemetry.js');
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.chrome;
    clearZeusGlobals();
  });

  function fallbackEvent(provider) {
    return { provider, reason: 'test', stage: 'unit' };
  }

  it('keeps stored history when an event is recorded before hydration completes', async () => {
    env.local.__seed({
      [STORAGE_KEY]: [{ type: 'fallback', at: '2026-01-01T00:00:00.000Z', payload: { provider: 'seeded' } }]
    });

    // Recorded while the initial storage read is still in flight.
    globalThis.ZeusTelemetry.trackFallback(fallbackEvent('openai'));

    await vi.runAllTimersAsync();

    const summary = await globalThis.ZeusTelemetry.getSummary();
    expect(summary.totalEvents).toBe(2);
    expect(summary.byProvider.seeded).toBe(1);
    expect(summary.byProvider.openai).toBe(1);
  });

  it('coalesces bursts of events into a single storage write', async () => {
    const setSpy = vi.spyOn(env.local, 'set');

    for (let index = 0; index < 25; index += 1) {
      globalThis.ZeusTelemetry.trackFallback(fallbackEvent('openai'));
    }

    await vi.advanceTimersByTimeAsync(1000);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(env.local.__data.get(STORAGE_KEY)).toHaveLength(25);
  });

  it('caps in-memory and persisted events at MAX_EVENTS', async () => {
    for (let index = 0; index < 300; index += 1) {
      globalThis.ZeusTelemetry.trackFallback(fallbackEvent(`provider-${index}`));
    }

    await vi.advanceTimersByTimeAsync(1000);

    const persisted = env.local.__data.get(STORAGE_KEY);
    expect(persisted).toHaveLength(globalThis.ZeusTelemetry.MAX_EVENTS);

    const summary = await globalThis.ZeusTelemetry.getSummary();
    expect(summary.totalEvents).toBe(250);
  });

  it('summarizes providers and reasons, and exposes only the latest 20 events', async () => {
    for (let index = 0; index < 30; index += 1) {
      globalThis.ZeusTelemetry.trackFallback({ provider: 'claude', reason: 'quota', stage: 'unit' });
    }

    await vi.advanceTimersByTimeAsync(1000);

    const summary = await globalThis.ZeusTelemetry.getSummary();
    expect(summary.totalEvents).toBe(30);
    expect(summary.byProvider).toEqual({ claude: 30 });
    expect(summary.byReason).toEqual({ quota: 30 });
    expect(summary.recent).toHaveLength(20);
  });

  it('reports the fallback count and clears on request', async () => {
    globalThis.ZeusTelemetry.trackFallback(fallbackEvent('openai'));
    globalThis.ZeusTelemetry.track('other', { provider: 'openai' });

    await vi.advanceTimersByTimeAsync(1000);
    expect(await globalThis.ZeusTelemetry.getFallbackCount()).toBe(1);

    globalThis.ZeusTelemetry.clear();
    await vi.advanceTimersByTimeAsync(1000);

    const summary = await globalThis.ZeusTelemetry.getSummary();
    expect(summary.totalEvents).toBe(0);
    expect(env.local.__data.get(STORAGE_KEY)).toEqual([]);
  });

  it('ignores empty event types', async () => {
    globalThis.ZeusTelemetry.track('', { provider: 'openai' });
    globalThis.ZeusTelemetry.track('   ', { provider: 'openai' });

    await vi.advanceTimersByTimeAsync(1000);

    const summary = await globalThis.ZeusTelemetry.getSummary();
    expect(summary.totalEvents).toBe(0);
  });
});
