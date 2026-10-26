const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Smart Router 2.0', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('model-registry.js');
    loadScript('settings/settings.js');
    loadScript('core/router.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  describe('Multi-Domain Intent & Complexity Analysis', () => {
    it('accurately identifies diverse intent domains', () => {
      const { analyzePrompt } = globalThis.ZeusRouter;

      expect(analyzePrompt('Debug this python memory leak in redis worker').intent).toBe('coding');
      expect(analyzePrompt('Prove the theorem using first principles and logical deduction').intent).toBe('reasoning');
      expect(analyzePrompt('Write a cyberpunk fiction story about an rogue AI').intent).toBe('creative');
      expect(analyzePrompt('Describe the architecture flowchart and UI mockup').intent).toBe('vision');
      expect(analyzePrompt('Quick cheap rewrite with minimal tokens').intent).toBe('cheap');
      expect(analyzePrompt('Produce an in-depth comprehensive whitepaper on zero trust').intent).toBe('long-form');
      expect(analyzePrompt('Summarize the above paragraph').intent).toBe('default');
    });

    it('calculates continuous complexity score and estimated token budget', () => {
      const { analyzePrompt } = globalThis.ZeusRouter;

      const simple = analyzePrompt('Hello');
      expect(simple.complexity).toBeLessThanOrEqual(0.3);
      expect(simple.estimatedTokens).toBe(2);

      const complexPrompt = [
        'Design a high-throughput distributed transaction processor in Go.',
        'Requirements and constraints:',
        '1. Must guarantee linearizability across partitions.',
        '2. Strictly handle edge cases: network splits, clock drift.',
        '```go',
        'type Tx struct { ID string; Amount int64 }',
        '```',
        'Explain step-by-step with validation.'
      ].join('\n');

      const complex = analyzePrompt(complexPrompt);
      expect(complex.complexity).toBeGreaterThanOrEqual(0.6);
      expect(complex.estimatedTokens).toBeGreaterThan(50);
    });
  });

  describe('Routing Profiles (balanced, performance, cost-saver, local-first)', () => {
    it('routes according to the performance profile', () => {
      const { autoRouteForIntent } = globalThis.ZeusRouter;

      const codingPerf = autoRouteForIntent('coding', { profile: 'performance' });
      expect(codingPerf.provider).toBe('openai');

      const reasoningPerf = autoRouteForIntent('reasoning', { profile: 'performance' });
      expect(reasoningPerf.provider).toBe('claude');
    });

    it('routes according to the cost-saver profile', () => {
      const { autoRouteForIntent } = globalThis.ZeusRouter;

      const route = autoRouteForIntent('coding', { profile: 'cost-saver' });
      expect(route.provider).toBe('gemini');
    });

    it('routes to local ollama for local-first profile', () => {
      const { autoRouteForIntent } = globalThis.ZeusRouter;

      const route = autoRouteForIntent('coding', { profile: 'local-first' });
      expect(route.provider).toBe('ollama');
    });
  });

  describe('Circuit Breaker Cooldown & Dynamic Candidate Ranking', () => {
    it('records provider failures and reports cooldown state', () => {
      const { recordProviderFailure, isProviderCoolingDown, clearProviderCooldown } = globalThis.ZeusRouter;

      expect(isProviderCoolingDown('openai')).toBe(false);

      recordProviderFailure('openai');
      expect(isProviderCoolingDown('openai', 60000)).toBe(true);
      expect(isProviderCoolingDown('claude', 60000)).toBe(false);

      clearProviderCooldown('openai');
      expect(isProviderCoolingDown('openai')).toBe(false);
    });

    it('demotes failing providers to the end of candidate list during cooldown', () => {
      const { buildSmartRouteCandidates, recordProviderFailure, clearProviderCooldown } = globalThis.ZeusRouter;

      clearProviderCooldown();

      const normal = buildSmartRouteCandidates({ provider: 'gemini', model: 'gemini-3-flash' });
      const normalProviders = normal.map((c) => c.provider);

      // Now fail openai
      recordProviderFailure('openai');

      const cooled = buildSmartRouteCandidates({ provider: 'gemini', model: 'gemini-3-flash' }, { cooldownMs: 60000 });
      const cooledProviders = cooled.map((c) => c.provider);

      // OpenAI should be at the very end
      expect(cooledProviders[cooledProviders.length - 1]).toBe('openai');
      expect(cooledProviders[0]).toBe('gemini');

      clearProviderCooldown();
    });

    it('maintains backward compatibility with legacy buildAutoRouteCandidates', () => {
      const { buildAutoRouteCandidates } = globalThis.ZeusRouter;
      const candidates = buildAutoRouteCandidates({ provider: 'openai', model: 'gpt-5.4-mini' });

      expect(candidates[0].provider).toBe('openai');
      expect(candidates[0].model).toBe('gpt-5.4-mini');
      expect(candidates.length).toBeGreaterThanOrEqual(4);
    });
  });
});
