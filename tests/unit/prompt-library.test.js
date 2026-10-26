const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusPromptLibrary', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/promptLibrary.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('exports ZeusPromptLibrary on globalScope', () => {
    expect(globalThis.ZeusPromptLibrary).toBeDefined();
    expect(typeof globalThis.ZeusPromptLibrary.createPrompt).toBe('function');
    expect(typeof globalThis.ZeusPromptLibrary.addVersion).toBe('function');
    expect(typeof globalThis.ZeusPromptLibrary.revertVersion).toBe('function');
    expect(typeof globalThis.ZeusPromptLibrary.computeVersionDiff).toBe('function');
  });

  it('extracts template variables accurately', () => {
    const { extractVariables } = globalThis.ZeusPromptLibrary;
    const text = 'Evaluate {{code}} in language {{language}} with {{iterations}} runs. Repeat {{code}}.';
    const vars = extractVariables(text);
    expect(vars).toEqual(['code', 'language', 'iterations']);
  });

  it('creates a new prompt with valid structure and initial v1 version', () => {
    const { createPrompt, getActiveVersion } = globalThis.ZeusPromptLibrary;
    const prompt = createPrompt({
      title: 'Postmortem Template',
      description: 'Standard incident review doc',
      category: 'Operations',
      tags: ['SRE', 'Incident'],
      content: 'Analyze incident {{incident_id}} impacting service {{service}}.',
      notes: 'Initial postmortem draft'
    });

    expect(prompt.id).toMatch(/^prompt_/);
    expect(prompt.title).toBe('Postmortem Template');
    expect(prompt.description).toBe('Standard incident review doc');
    expect(prompt.category).toBe('Operations');
    expect(prompt.tags).toEqual(['sre', 'incident']);
    expect(prompt.activeVersionId).toBe('v1');
    expect(prompt.versions.length).toBe(1);

    const active = getActiveVersion(prompt);
    expect(active.versionId).toBe('v1');
    expect(active.versionNumber).toBe(1);
    expect(active.variables).toEqual(['incident_id', 'service']);
    expect(active.notes).toBe('Initial postmortem draft');
  });

  it('rejects prompt creation without title or content', () => {
    const { createPrompt } = globalThis.ZeusPromptLibrary;
    expect(() => createPrompt({ content: 'Test' })).toThrow('Prompt title is required.');
    expect(() => createPrompt({ title: 'Test', content: '' })).toThrow('Prompt content cannot be empty.');
  });

  it('adds sequential versions with incrementing numbers and updates activeVersionId', () => {
    const { createPrompt, addVersion, getActiveVersion } = globalThis.ZeusPromptLibrary;
    const prompt = createPrompt({
      title: 'API Spec',
      content: 'Define endpoint {{path}}.'
    });

    const v2Prompt = addVersion(prompt, {
      content: 'Define endpoint {{path}} with auth header {{auth_type}}.',
      notes: 'Added auth specification'
    });

    expect(v2Prompt.versions.length).toBe(2);
    expect(v2Prompt.activeVersionId).toBe('v2');
    const v2Active = getActiveVersion(v2Prompt);
    expect(v2Active.versionId).toBe('v2');
    expect(v2Active.versionNumber).toBe(2);
    expect(v2Active.variables).toEqual(['path', 'auth_type']);
    expect(v2Active.notes).toBe('Added auth specification');

    const v3Prompt = addVersion(v2Prompt, {
      content: 'Define endpoint {{path}} with auth header {{auth_type}} and status {{code}}.',
      notes: 'Added return code'
    });

    expect(v3Prompt.versions.length).toBe(3);
    expect(v3Prompt.activeVersionId).toBe('v3');
    expect(getActiveVersion(v3Prompt).versionNumber).toBe(3);
  });

  it('reverts to a prior version without discarding newer revisions', () => {
    const { createPrompt, addVersion, revertVersion, getActiveVersion } = globalThis.ZeusPromptLibrary;
    let prompt = createPrompt({
      title: 'Database Query',
      content: 'SELECT * FROM users;'
    });
    prompt = addVersion(prompt, { content: 'SELECT id, email FROM users;', notes: 'Avoid select star' });
    prompt = addVersion(prompt, { content: 'SELECT id, email FROM users WHERE active = true;', notes: 'Filter active' });

    expect(prompt.activeVersionId).toBe('v3');
    expect(prompt.versions.length).toBe(3);

    // Revert to v1
    const reverted = revertVersion(prompt, 'v1');
    expect(reverted.activeVersionId).toBe('v1');
    expect(getActiveVersion(reverted).content).toBe('SELECT * FROM users;');
    // All 3 versions still preserved in history!
    expect(reverted.versions.length).toBe(3);

    // Reverting to unknown version throws error
    expect(() => revertVersion(reverted, 'v99')).toThrow("Version 'v99' not found.");
  });

  it('searches prompts by title, description, content, and tags', () => {
    const { createPrompt, searchPrompts } = globalThis.ZeusPromptLibrary;
    const p1 = createPrompt({
      title: 'Kubernetes Pod Debugging',
      description: 'Step-by-step crashloop diagnosis',
      category: 'DevOps',
      tags: ['k8s', 'containers'],
      content: 'Inspect kubectl logs for pod {{pod_name}}.'
    });

    const p2 = createPrompt({
      title: 'SQL Performance Audit',
      description: 'Index optimization advisor',
      category: 'Database',
      tags: ['postgres', 'indexing'],
      content: 'EXPLAIN ANALYZE on query {{query}}.'
    });

    const list = [p1, p2];

    expect(searchPrompts(list, { query: 'crashloop' }).length).toBe(1);
    expect(searchPrompts(list, { query: 'crashloop' })[0].id).toBe(p1.id);

    expect(searchPrompts(list, { query: 'postgres' }).length).toBe(1);
    expect(searchPrompts(list, { query: 'postgres' })[0].id).toBe(p2.id);

    expect(searchPrompts(list, { category: 'DevOps' }).length).toBe(1);
    expect(searchPrompts(list, { category: 'Database' })[0].id).toBe(p2.id);

    expect(searchPrompts(list, { tag: 'k8s' }).length).toBe(1);
    expect(searchPrompts(list, { query: 'nonexistent' }).length).toBe(0);
  });

  it('computes line-by-line diff between revisions', () => {
    const { computeVersionDiff } = globalThis.ZeusPromptLibrary;
    const oldText = 'Line 1\nLine 2\nLine 3';
    const newText = 'Line 1\nLine 2 modified\nLine 3\nLine 4 added';

    const diff = computeVersionDiff(oldText, newText);
    expect(diff.length).toBe(4);
    expect(diff[0].type).toBe('unchanged');
    expect(diff[1].type).toBe('changed');
    expect(diff[1].oldLine).toBe('Line 2');
    expect(diff[1].newLine).toBe('Line 2 modified');
    expect(diff[2].type).toBe('unchanged');
    expect(diff[3].type).toBe('added');
    expect(diff[3].line).toBe('Line 4 added');
  });

  it('seeds default starter prompts when storage is empty or invalid', () => {
    const { normalizeLibrary, DEFAULT_STARTER_PROMPTS } = globalThis.ZeusPromptLibrary;
    const emptyResult = normalizeLibrary([]);
    expect(emptyResult.length).toBe(DEFAULT_STARTER_PROMPTS.length);
    expect(emptyResult[0].title).toBe('Military-Grade Code Review');
    expect(emptyResult[0].versions[0].versionId).toBe('v1');
  });

  it('loads and saves to chrome.storage API seamlessly', async () => {
    const store = {};
    globalThis.chrome = {
      storage: {
        sync: {
          get(keys, cb) {
            cb(store);
          },
          set(items, cb) {
            Object.assign(store, items);
            cb();
          }
        }
      },
      runtime: { lastError: null }
    };

    const { loadLibrary, saveLibrary, createPrompt } = globalThis.ZeusPromptLibrary;

    const initial = await loadLibrary();
    expect(initial.length).toBeGreaterThan(0);

    const custom = createPrompt({
      title: 'Custom Test Prompt',
      content: 'Write unit tests for {{module}}.'
    });

    const saved = await saveLibrary([custom, ...initial]);
    expect(saved[0].title).toBe('Custom Test Prompt');

    const reloaded = await loadLibrary();
    expect(reloaded[0].title).toBe('Custom Test Prompt');
    expect(reloaded[0].activeVersionId).toBe('v1');
  });
});
