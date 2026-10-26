(function registerWorkflowsModule(globalScope) {
  const STORAGE_KEY = 'zeus_workflows';

  function sanitizeString(val, fallback = '') {
    if (typeof val === 'string') return val.trim();
    if (val === null || val === undefined) return fallback;
    return String(val).trim();
  }

  function createDefaultWorkflows() {
    return [
      {
        id: 'cot-refinement',
        name: 'Cognitive Chain-of-Thought Optimization',
        description: 'Deconstructs intent, hardens domain persona & constraints, and polishes output structure in 3 stages.',
        builtin: true,
        steps: [
          {
            id: 'cot-step-1',
            name: 'Deconstruct Intent & Implicit Goals',
            instruction: 'Deconstruct the user prompt. Identify the core intent, unspoken assumptions, domain requirements, and missing background context. Output a detailed breakdown of what the prompt truly aims to achieve.',
            stopOnError: true
          },
          {
            id: 'cot-step-2',
            name: 'Expert Persona & Edge-Case Mapping',
            instruction: 'Given the intent analysis, assign an elite domain specialist persona. Formulate rigorous constraints, edge-case protections, security rules, and quality verification standards.',
            stopOnError: true
          },
          {
            id: 'cot-step-3',
            name: 'Structural Synthesis & Strict Formatting',
            instruction: 'Synthesize the previous analysis and constraints into a single, cohesive, production-grade prompt. Enforce strict plain text formatting, numbered steps, labeled sections, and unambiguous deliverable criteria.',
            stopOnError: true
          }
        ],
        createdAt: 1776000000000,
        updatedAt: 1776000000000
      },
      {
        id: 'critique-refine',
        name: 'Adversarial Critique & Hardening',
        description: 'Generates a baseline prompt, attacks it for ambiguities and edge-case vulnerabilities, and synthesizes a hardened final prompt.',
        builtin: true,
        steps: [
          {
            id: 'critique-step-1',
            name: 'Baseline Prompt Expansion',
            instruction: 'Expand the user prompt into a well-structured, clear initial instruction set with role, objective, and execution guidelines.',
            stopOnError: true
          },
          {
            id: 'critique-step-2',
            name: 'Adversarial Gap Critique',
            instruction: 'Conduct an adversarial critique of the prompt. Identify all loopholes, ambiguous phrasing, missed edge cases, failure modes, and areas where an LLM could produce low-quality or hallucinated output.',
            stopOnError: true
          },
          {
            id: 'critique-step-3',
            name: 'Fortified Synthesis',
            instruction: 'Synthesize the baseline prompt and adversarial critique. Resolve every identified gap and output a bulletproof, hardened prompt.',
            stopOnError: true
          }
        ],
        createdAt: 1776000000000,
        updatedAt: 1776000000000
      },
      {
        id: 'code-spec-pipeline',
        name: 'Engineering Architecture & Spec Generator',
        description: 'Transforms raw software ideas into production architecture, API contracts, and implementation test matrices.',
        builtin: true,
        steps: [
          {
            id: 'spec-step-1',
            name: 'Architecture & Data Modeling',
            instruction: 'Analyze the engineering requirements. Define core system components, entities, data models, state transitions, and high-level architectural boundaries.',
            stopOnError: true
          },
          {
            id: 'spec-step-2',
            name: 'API Contract & Error Boundaries',
            instruction: 'Specify the complete interface contracts (endpoints, signatures, data types), validation rules, error handling behavior, and failure recovery protocols.',
            stopOnError: true
          },
          {
            id: 'spec-step-3',
            name: 'Implementation Matrix & Test Criteria',
            instruction: 'Create a concrete implementation task matrix, unit/integration test specifications, edge cases, and deterministic acceptance criteria.',
            stopOnError: true
          }
        ],
        createdAt: 1776000000000,
        updatedAt: 1776000000000
      }
    ];
  }

  function substituteVariables(template, variables = {}) {
    if (typeof template !== 'string') return '';
    if (!variables || typeof variables !== 'object') return template;

    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/gi, (match, key) => {
      const lowerKey = key.toLowerCase();
      // Look for direct or lower-case match
      for (const [varKey, varVal] of Object.entries(variables)) {
        if (varKey.toLowerCase() === lowerKey) {
          return varVal != null ? String(varVal) : '';
        }
      }
      return match;
    });
  }

  function validateWorkflow(workflow) {
    const errors = [];
    if (!workflow || typeof workflow !== 'object') {
      return { valid: false, errors: ['Workflow must be an object.'] };
    }

    if (!sanitizeString(workflow.id)) {
      errors.push('Workflow missing valid id.');
    }
    if (!sanitizeString(workflow.name)) {
      errors.push('Workflow missing valid name.');
    }
    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      errors.push('Workflow must contain at least one step.');
    } else {
      workflow.steps.forEach((step, idx) => {
        if (!step || typeof step !== 'object') {
          errors.push(`Step at index ${idx} is invalid.`);
          return;
        }
        if (!sanitizeString(step.id)) {
          errors.push(`Step ${idx + 1} missing step id.`);
        }
        if (!sanitizeString(step.name)) {
          errors.push(`Step ${idx + 1} missing step name.`);
        }
        if (!sanitizeString(step.instruction)) {
          errors.push(`Step ${idx + 1} missing instruction.`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  function normalizeWorkflow(raw) {
    const defaults = {
      id: `workflow-${Date.now().toString(36)}`,
      name: 'Custom Workflow',
      description: '',
      builtin: false,
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (!raw || typeof raw !== 'object') return defaults;

    const id = sanitizeString(raw.id) || defaults.id;
    const name = sanitizeString(raw.name) || defaults.name;
    const description = sanitizeString(raw.description);
    const builtin = Boolean(raw.builtin);
    const createdAt = Number(raw.createdAt) || defaults.createdAt;
    const updatedAt = Number(raw.updatedAt) || Date.now();

    const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s, idx) => ({
      id: sanitizeString(s?.id) || `step-${idx + 1}`,
      name: sanitizeString(s?.name) || `Step ${idx + 1}`,
      instruction: sanitizeString(s?.instruction) || '',
      provider: sanitizeString(s?.provider) || undefined,
      model: sanitizeString(s?.model) || undefined,
      stopOnError: s?.stopOnError !== undefined ? Boolean(s.stopOnError) : true
    }));

    return {
      id,
      name,
      description,
      builtin,
      steps,
      createdAt,
      updatedAt
    };
  }

  async function executeWorkflow(initialPrompt, workflowInput, options = {}) {
    const rawPrompt = sanitizeString(initialPrompt);
    if (!rawPrompt) {
      throw new Error('Initial prompt cannot be empty for workflow execution.');
    }

    const workflow = normalizeWorkflow(workflowInput);
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`Invalid workflow definition: ${validation.errors.join('; ')}`);
    }

    const router = options.router || globalScope.ZeusRouter;
    if (!router || typeof router.enhancePrompt !== 'function') {
      throw new Error('Router module is required to execute workflow steps.');
    }

    const abortSignal = options.abortSignal;
    const onStepStart = typeof options.onStepStart === 'function' ? options.onStepStart : null;
    const onStepComplete = typeof options.onStepComplete === 'function' ? options.onStepComplete : null;
    const onError = typeof options.onError === 'function' ? options.onError : null;

    const trace = [];
    const stepOutputs = {};
    let currentPrompt = rawPrompt;
    const startTime = Date.now();

    for (let i = 0; i < workflow.steps.length; i++) {
      if (abortSignal?.aborted) {
        const errorMsg = 'Workflow execution was aborted by user.';
        const stepTrace = {
          stepId: workflow.steps[i].id,
          stepName: workflow.steps[i].name,
          stepIndex: i,
          status: 'skipped',
          input: currentPrompt,
          output: '',
          latencyMs: 0,
          error: errorMsg
        };
        trace.push(stepTrace);
        return {
          success: false,
          workflowId: workflow.id,
          workflowName: workflow.name,
          initialPrompt: rawPrompt,
          finalPrompt: currentPrompt,
          totalLatencyMs: Date.now() - startTime,
          trace,
          error: errorMsg
        };
      }

      const step = workflow.steps[i];
      const stepStartTime = Date.now();

      // Build substitution variables for step
      const stepVariables = {
        input: currentPrompt,
        original_prompt: rawPrompt,
        ...stepOutputs,
        [`step_${i + 1}`]: currentPrompt
      };

      const resolvedInstruction = substituteVariables(step.instruction, stepVariables);

      if (onStepStart) {
        onStepStart({
          stepId: step.id,
          stepName: step.name,
          stepIndex: i,
          totalSteps: workflow.steps.length,
          input: currentPrompt
        });
      }

      const stepTrace = {
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        status: 'running',
        input: currentPrompt,
        output: '',
        latencyMs: 0,
        provider: step.provider,
        model: step.model
      };

      try {
        const enhanceOptions = {
          transform: {
            id: step.id,
            name: step.name,
            instruction: resolvedInstruction
          },
          provider: step.provider,
          model: step.model,
          conversationContext: options.conversationContext,
          attachments: options.attachments
        };

        const output = await router.enhancePrompt(currentPrompt, enhanceOptions);
        const latency = Date.now() - stepStartTime;

        stepTrace.status = 'completed';
        stepTrace.output = output;
        stepTrace.latencyMs = latency;
        trace.push(stepTrace);

        currentPrompt = output;
        stepOutputs[`step_${i + 1}_output`] = output;
        stepOutputs[`step_${step.id}_output`] = output;

        if (onStepComplete) {
          onStepComplete({
            ...stepTrace,
            output
          });
        }
      } catch (err) {
        const latency = Date.now() - stepStartTime;
        const errMsg = String(err?.message || 'Step execution failed');
        stepTrace.status = 'failed';
        stepTrace.latencyMs = latency;
        stepTrace.error = errMsg;
        trace.push(stepTrace);

        if (onError) {
          onError({
            stepId: step.id,
            stepName: step.name,
            stepIndex: i,
            error: errMsg
          });
        }

        if (step.stopOnError !== false) {
          return {
            success: false,
            workflowId: workflow.id,
            workflowName: workflow.name,
            initialPrompt: rawPrompt,
            finalPrompt: currentPrompt,
            totalLatencyMs: Date.now() - startTime,
            trace,
            error: `Workflow stopped at step "${step.name}": ${errMsg}`
          };
        }
      }
    }

    return {
      success: true,
      workflowId: workflow.id,
      workflowName: workflow.name,
      initialPrompt: rawPrompt,
      finalPrompt: currentPrompt,
      totalLatencyMs: Date.now() - startTime,
      trace
    };
  }

  function getStorageArea(customStorage) {
    if (customStorage) return customStorage;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  async function getAllWorkflows(storageArea = null) {
    const area = getStorageArea(storageArea);
    const defaults = createDefaultWorkflows();

    if (!area || typeof area.get !== 'function') {
      return defaults;
    }

    return new Promise((resolve) => {
      area.get([STORAGE_KEY], (data) => {
        const stored = Array.isArray(data?.[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
        if (stored.length === 0) {
          resolve(defaults);
          return;
        }

        // Merge defaults with stored workflows (stored overrides default if same id)
        const map = new Map();
        defaults.forEach((d) => map.set(d.id, d));
        stored.forEach((s) => {
          if (s && s.id) {
            map.set(s.id, normalizeWorkflow(s));
          }
        });

        resolve(Array.from(map.values()));
      });
    });
  }

  async function saveWorkflow(workflowInput, storageArea = null) {
    const area = getStorageArea(storageArea);
    const normalized = normalizeWorkflow(workflowInput);
    normalized.updatedAt = Date.now();

    const validation = validateWorkflow(normalized);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }

    if (!area || typeof area.get !== 'function' || typeof area.set !== 'function') {
      return normalized;
    }

    return new Promise((resolve, reject) => {
      area.get([STORAGE_KEY], (data) => {
        let stored = Array.isArray(data?.[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
        const existingIdx = stored.findIndex((w) => w.id === normalized.id);

        if (existingIdx >= 0) {
          stored[existingIdx] = normalized;
        } else {
          stored.push(normalized);
        }

        area.set({ [STORAGE_KEY]: stored }, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(normalized);
          }
        });
      });
    });
  }

  async function deleteWorkflow(workflowId, storageArea = null) {
    const area = getStorageArea(storageArea);
    const id = sanitizeString(workflowId);

    if (!area || typeof area.get !== 'function' || typeof area.set !== 'function') {
      return true;
    }

    return new Promise((resolve, reject) => {
      area.get([STORAGE_KEY], (data) => {
        let stored = Array.isArray(data?.[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
        stored = stored.filter((w) => w.id !== id);

        area.set({ [STORAGE_KEY]: stored }, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(true);
          }
        });
      });
    });
  }

  const moduleExports = {
    STORAGE_KEY,
    createDefaultWorkflows,
    substituteVariables,
    validateWorkflow,
    normalizeWorkflow,
    executeWorkflow,
    getAllWorkflows,
    saveWorkflow,
    deleteWorkflow
  };

  globalScope.ZeusWorkflows = moduleExports;
})(typeof globalThis !== 'undefined' ? globalThis : this);
