const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusProviderUtils', () => {
  beforeEach(() => {
    clearZeusGlobals();

    globalThis.ZeusModelRegistry = {
      getFallbackModels: vi.fn().mockReturnValue(['fallback-a', 'fallback-b'])
    };

    globalThis.ZeusTelemetry = {
      trackFallback: vi.fn()
    };

    loadScript('providers/utils.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('builds deduplicated candidate model list', () => {
    const candidates = globalThis.ZeusProviderUtils.buildModelCandidates(
      'openai',
      'preferred-model',
      ['preferred-model', 'custom-model']
    );

    expect(candidates).toEqual(['preferred-model', 'custom-model', 'fallback-a', 'fallback-b']);
  });

  it('tracks fallback telemetry through shared helper', () => {
    globalThis.ZeusProviderUtils.trackFallbackEvent({
      provider: 'openai',
      fromModel: 'm1',
      toModel: 'm2',
      reason: 'model_not_found'
    });

    expect(globalThis.ZeusTelemetry.trackFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'provider-fallback',
        provider: 'openai',
        fromModel: 'm1',
        toModel: 'm2'
      })
    );
  });
});
