const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusWorkflows', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/workflows.js');
    loadScript('core/presets.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('exports ZeusWorkflows on globalScope with required interfaces', () => {
    expect(globalThis.ZeusWorkflows).toBeDefined();
    expect(typeof globalThis.ZeusWorkflows.createDefaultWorkflows).toBe('function');
    expect(typeof globalThis.ZeusWorkflows.substituteVariables).toBe('function');
    expect(typeof globalThis.ZeusWorkflows.validateWorkflow).toBe('function');
    expect(typeof globalThis.ZeusWorkflows.normalizeWorkflow).toBe('function');
    expect(typeof globalThis.ZeusWorkflows.executeWorkflow).toBe('function');
    expect(typeof globalThis.ZeusWorkflows.getAllWorkflows).toBe('function');
    expect(typeof globalThis.ZeusWorkflows.saveWorkflow).toBe('function');
    expect(typeof globalThis.ZeusWorkflows.deleteWorkflow).toBe('function');
  });

  describe('createDefaultWorkflows', () => {
    it('provides three built-in workflow loadouts with valid structure', () => {
      const defaults = globalThis.ZeusWorkflows.createDefaultWorkflows();
      expect(Array.isArray(defaults)).toBe(true);
      expect(defaults.length).toBe(3);

      const ids = defaults.map((w) => w.id);
      expect(ids).toContain('cot-refinement');
      expect(ids).toContain('critique-refine');
      expect(ids).toContain('code-spec-pipeline');

      defaults.forEach((wf) => {
        const validation = globalThis.ZeusWorkflows.validateWorkflow(wf);
        expect(validation.valid).toBe(true);
        expect(wf.builtin).toBe(true);
        expect(wf.steps.length).toBe(3);
      });
    });
  });

  describe('substituteVariables', () => {
    it('substitutes single and multiple variables case-insensitively', () => {
      const { substituteVariables } = globalThis.ZeusWorkflows;
      const template = 'Analyze this input: {{input}} and compare to: {{original_prompt}}. Step 1 was: {{STEP_1}}.';
      const result = substituteVariables(template, {
        input: 'Current refined text',
        original_prompt: 'Raw user prompt',
        step_1: 'Intermediate result'
      });

      expect(result).toBe('Analyze this input: Current refined text and compare to: Raw user prompt. Step 1 was: Intermediate result.');
    });

    it('leaves unknown variables intact and handles non-string inputs safely', () => {
      const { substituteVariables } = globalThis.ZeusWorkflows;
      expect(substituteVariables('No vars here', {})).toBe('No vars here');
      expect(substituteVariables('Keep {{unknown_var}}', { other: 'val' })).toBe('Keep {{unknown_var}}');
      expect(substituteVariables(null)).toBe('');
    });
  });

  describe('validateWorkflow and normalizeWorkflow', () => {
    it('validates correct workflows and flags missing or malformed fields', () => {
      const { validateWorkflow } = globalThis.ZeusWorkflows;

      const valid = {
        id: 'test-wf',
        name: 'Test Workflow',
        steps: [
          { id: 's1', name: 'Step 1', instruction: 'Rewrite concisely.' }
        ]
      };
      expect(validateWorkflow(valid).valid).toBe(true);

      expect(validateWorkflow(null).valid).toBe(false);
      expect(validateWorkflow({ id: 'test' }).valid).toBe(false);
      expect(validateWorkflow({ id: 'test', name: 'Test', steps: [] }).valid).toBe(false);
      expect(validateWorkflow({ id: 'test', name: 'Test', steps: [{ name: 'Missing id and instruction' }] }).valid).toBe(false);
    });

    it('normalizes workflow objects with defaults', () => {
      const { normalizeWorkflow } = globalThis.ZeusWorkflows;
      const normalized = normalizeWorkflow({
        name: 'My Custom Workflow',
        steps: [{ instruction: 'Do step' }]
      });

      expect(normalized.id).toBeDefined();
      expect(normalized.name).toBe('My Custom Workflow');
      expect(normalized.steps.length).toBe(1);
      expect(normalized.steps[0].id).toBe('step-1');
      expect(normalized.steps[0].stopOnError).toBe(true);
    });
  });

  describe('executeWorkflow', () => {
    it('executes workflow steps sequentially and propagates outputs', async () => {
      const calls = [];
      const mockRouter = {
        enhancePrompt: async (prompt, options) => {
          calls.push({ prompt, options });
          const stepName = options?.transform?.name || 'step';
          return `[${stepName} applied to "${prompt}"]`;
        }
      };

      const workflow = {
        id: 'test-flow',
        name: 'Two-Stage Polish',
        steps: [
          { id: 's1', name: 'Deconstruct', instruction: 'Deconstruct {{input}}' },
          { id: 's2', name: 'Synthesize', instruction: 'Synthesize based on original: {{original_prompt}} and current: {{input}}' }
        ]
      };

      const started = [];
      const completed = [];

      const result = await globalThis.ZeusWorkflows.executeWorkflow('write a poem', workflow, {
        router: mockRouter,
        onStepStart: (s) => started.push(s.stepId),
        onStepComplete: (s) => completed.push(s.stepId)
      });

      expect(result.success).toBe(true);
      expect(result.initialPrompt).toBe('write a poem');
      expect(result.finalPrompt).toBe('[Synthesize applied to "[Deconstruct applied to "write a poem"]"]');
      expect(result.trace.length).toBe(2);
      expect(result.trace[0].status).toBe('completed');
      expect(result.trace[1].status).toBe('completed');
      expect(started).toEqual(['s1', 's2']);
      expect(completed).toEqual(['s1', 's2']);

      expect(calls.length).toBe(2);
      expect(calls[0].prompt).toBe('write a poem');
      expect(calls[0].options.transform.instruction).toBe('Deconstruct write a poem');
      expect(calls[1].options.transform.instruction).toContain('original: write a poem');
    });

    it('stops execution when step fails with stopOnError: true', async () => {
      const mockRouter = {
        enhancePrompt: async (_prompt, options) => {
          if (options?.transform?.id === 'failing-step') {
            throw new Error('API Rate Limit Exceeded');
          }
          return 'Success step output';
        }
      };

      const workflow = {
        id: 'failing-flow',
        name: 'Failure Test',
        steps: [
          { id: 'failing-step', name: 'Fail Step', instruction: 'Fail now', stopOnError: true },
          { id: 'never-reached', name: 'Never Run', instruction: 'Skip this' }
        ]
      };

      const errors = [];
      const result = await globalThis.ZeusWorkflows.executeWorkflow('test prompt', workflow, {
        router: mockRouter,
        onError: (e) => errors.push(e)
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API Rate Limit Exceeded');
      expect(result.trace.length).toBe(1);
      expect(result.trace[0].status).toBe('failed');
      expect(errors.length).toBe(1);
    });

    it('continues to next step when a failing step has stopOnError: false', async () => {
      const mockRouter = {
        enhancePrompt: async (prompt, options) => {
          if (options?.transform?.id === 'non-fatal-step') {
            throw new Error('Minor Warning');
          }
          return `Handled: ${prompt}`;
        }
      };

      const workflow = {
        id: 'resilient-flow',
        name: 'Resilient Test',
        steps: [
          { id: 'non-fatal-step', name: 'Warning Step', instruction: 'Optional step', stopOnError: false },
          { id: 'recovery-step', name: 'Recovery Step', instruction: 'Recover step' }
        ]
      };

      const result = await globalThis.ZeusWorkflows.executeWorkflow('start prompt', workflow, {
        router: mockRouter
      });

      expect(result.success).toBe(true);
      expect(result.trace.length).toBe(2);
      expect(result.trace[0].status).toBe('failed');
      expect(result.trace[1].status).toBe('completed');
      expect(result.finalPrompt).toBe('Handled: start prompt');
    });

    it('halts and marks skipped steps when abortSignal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockRouter = {
        enhancePrompt: async () => 'Should not run'
      };

      const workflow = {
        id: 'aborted-flow',
        name: 'Abort Test',
        steps: [
          { id: 's1', name: 'Step 1', instruction: 'Run 1' }
        ]
      };

      const result = await globalThis.ZeusWorkflows.executeWorkflow('start', workflow, {
        router: mockRouter,
        abortSignal: controller.signal
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
      expect(result.trace[0].status).toBe('skipped');
    });
  });

  describe('Storage CRUD operations', () => {
    it('loads workflows from mock storage with default fallback', async () => {
      const mockStore = {};
      const mockStorage = {
        get: (keys, cb) => cb({ [keys[0]]: mockStore[keys[0]] }),
        set: (items, cb) => {
          Object.assign(mockStore, items);
          cb?.();
        }
      };

      const list = await globalThis.ZeusWorkflows.getAllWorkflows(mockStorage);
      expect(list.length).toBe(3);

      const custom = {
        id: 'custom-wf-1',
        name: 'Custom Team Pipeline',
        steps: [{ id: 's1', name: 'S1', instruction: 'Instruction 1' }]
      };
      await globalThis.ZeusWorkflows.saveWorkflow(custom, mockStorage);

      const updated = await globalThis.ZeusWorkflows.getAllWorkflows(mockStorage);
      expect(updated.length).toBe(4);
      expect(updated.some((w) => w.id === 'custom-wf-1')).toBe(true);

      await globalThis.ZeusWorkflows.deleteWorkflow('custom-wf-1', mockStorage);
      const afterDelete = await globalThis.ZeusWorkflows.getAllWorkflows(mockStorage);
      expect(afterDelete.some((w) => w.id === 'custom-wf-1')).toBe(false);
    });
  });

  describe('Presets Integration', () => {
    it('exports and imports workflows within preset bundles', () => {
      const presets = globalThis.ZeusPresets;
      expect(presets).toBeDefined();

      const sampleWorkflows = [
        {
          id: 'team-workflow-a',
          name: 'Team Spec Workflow',
          description: 'Custom team workflow for PRDs',
          steps: [
            { id: 'step-1', name: 'Extract Scope', instruction: 'Extract requirements' }
          ]
        }
      ];

      const bundle = presets.exportPresetBundle({
        meta: { name: 'Engineering Bundle', author: 'Team Zeus' },
        workflows: sampleWorkflows
      });

      expect(bundle.presets.workflows).toBeDefined();
      expect(bundle.presets.workflows.length).toBe(1);
      expect(bundle.presets.workflows[0].id).toBe('team-workflow-a');

      const imported = presets.importPresetBundle(bundle, { workflows: [] }, { mode: 'merge' });
      expect(imported.success).toBe(true);
      expect(imported.stats.workflowsCount).toBe(1);
      expect(imported.nextState.workflows.length).toBe(1);
      expect(imported.nextState.workflows[0].name).toBe('Team Spec Workflow');
    });
  });
});
