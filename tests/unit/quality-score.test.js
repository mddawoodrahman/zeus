const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusQualityScorer', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/qualityScore.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('exports ZeusQualityScorer on globalScope', () => {
    expect(globalThis.ZeusQualityScorer).toBeDefined();
    expect(typeof globalThis.ZeusQualityScorer.evaluateQuality).toBe('function');
    expect(typeof globalThis.ZeusQualityScorer.compareVariants).toBe('function');
    expect(typeof globalThis.ZeusQualityScorer.createExperimentRecord).toBe('function');
  });

  it('evaluates empty or null prompt gracefully with zero score', () => {
    const { evaluateQuality } = globalThis.ZeusQualityScorer;

    const empty = evaluateQuality('');
    expect(empty.score).toBe(0);
    expect(empty.grade).toBe('D');
    expect(empty.dimensions.clarity).toBe(0);

    const nullish = evaluateQuality(null);
    expect(nullish.score).toBe(0);
    expect(nullish.grade).toBe('D');
  });

  it('penalizes vague words and awards low score to unrefined prompts', () => {
    const { evaluateQuality } = globalThis.ZeusQualityScorer;

    const vaguePrompt = 'Do some stuff and make it good and nice etc.';
    const result = evaluateQuality(vaguePrompt);

    expect(result.score).toBeLessThan(50);
    expect(result.grade).toBe('D');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('evaluates well-architected prompts with high scores and accurate dimension breakdown', () => {
    const { evaluateQuality } = globalThis.ZeusQualityScorer;

    const highQualityPrompt = [
      'You are a Principal Security Engineer.',
      'Analyze the following OAuth2 implementation for authorization code leakage.',
      '',
      '### Constraints & Rules',
      '- Must identify CSRF vulnerabilities in redirect URIs.',
      '- Strict requirement: do not include conversational preamble.',
      '- Limit to 3 highest severity findings.',
      '',
      '### Output Format',
      'Provide your response as a Markdown table with columns: Vulnerability, Severity, Remediation.',
      '',
      '### Input Example',
      '```json',
      '{"client_id": "app_123", "redirect_uri": "https://callback.com"}',
      '```'
    ].join('\n');

    const result = evaluateQuality(highQualityPrompt);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(['S', 'A']).toContain(result.grade);

    // Verify all dimension sub-scores are bounded between 0 and 20
    const dims = result.dimensions;
    expect(dims.clarity).toBeGreaterThanOrEqual(14);
    expect(dims.structure).toBeGreaterThanOrEqual(14);
    expect(dims.context).toBeGreaterThanOrEqual(14);
    expect(dims.examples).toBeGreaterThanOrEqual(14);
    expect(dims.efficiency).toBeGreaterThanOrEqual(12);

    expect(dims.clarity).toBeLessThanOrEqual(20);
    expect(dims.structure).toBeLessThanOrEqual(20);
    expect(dims.context).toBeLessThanOrEqual(20);
    expect(dims.examples).toBeLessThanOrEqual(20);
    expect(dims.efficiency).toBeLessThanOrEqual(20);
  });

  it('deducts points for polite filler phrases to encourage token efficiency', () => {
    const { evaluateQuality } = globalThis.ZeusQualityScorer;

    const cleanPrompt = 'Analyze the memory profile of this Node.js process and report leaks as a table.';
    const bloatedPrompt = 'Can you please, if you don\'t mind, i would like you to analyze the memory profile of this Node.js process and report leaks as a table.';

    const cleanScore = evaluateQuality(cleanPrompt);
    const bloatedScore = evaluateQuality(bloatedPrompt);

    expect(cleanScore.dimensions.efficiency).toBeGreaterThan(bloatedScore.dimensions.efficiency);
  });

  it('compares two prompt variants and accurately determines delta and winner', () => {
    const { compareVariants } = globalThis.ZeusQualityScorer;

    const promptA = 'Fix this code.';
    const promptB = [
      'You are an expert systems programmer.',
      'Refactor this C++ function for thread safety.',
      '- Must avoid data races.',
      '- Format as step-by-step diff.',
      'For example: input: mutex.lock() output: std::lock_guard'
    ].join('\n');

    const comparison = compareVariants(promptA, promptB, { labelA: 'Naive', labelB: 'Optimized' });

    expect(comparison.winner).toBe('B');
    expect(comparison.delta).toBeGreaterThan(30);
    expect(comparison.variantA.label).toBe('Naive');
    expect(comparison.variantB.label).toBe('Optimized');
    expect(comparison.improvements.length).toBeGreaterThan(0);
    expect(typeof comparison.dimensionDeltas.clarity).toBe('number');
  });

  it('handles identical variants as a TIE with zero delta', () => {
    const { compareVariants } = globalThis.ZeusQualityScorer;

    const prompt = 'You are an engineer. Write a function in Python.';
    const comparison = compareVariants(prompt, prompt);

    expect(comparison.delta).toBe(0);
    expect(comparison.winner).toBe('TIE');
    expect(comparison.improvements.length).toBe(0);
  });

  it('creates structured experiment records with unique IDs and comparison data', () => {
    const { createExperimentRecord } = globalThis.ZeusQualityScorer;

    const record = createExperimentRecord({
      title: 'Testing Python Prompt Variants',
      promptA: 'Write a script.',
      promptB: 'You are a senior python dev. Write an async script with retry rules.',
      userWinner: 'B',
      notes: 'B produced vastly superior code.'
    });

    expect(record.id).toMatch(/^ab_/);
    expect(record.title).toBe('Testing Python Prompt Variants');
    expect(record.userWinner).toBe('B');
    expect(record.comparison).toBeDefined();
    expect(record.comparison.winner).toBe('B');
    expect(record.notes).toBe('B produced vastly superior code.');
    expect(typeof record.createdAt).toBe('number');
  });
});
