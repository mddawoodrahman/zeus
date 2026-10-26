(function registerPresetsModule(globalScope) {
  const FORMAT_IDENTIFIER = 'zeus-preset-pack';
  const FORMAT_VERSION = '1.0.0';

  function sanitizeString(val, fallback = '') {
    if (typeof val === 'string') return val.trim();
    if (val === null || val === undefined) return fallback;
    return String(val).trim();
  }

  function validatePresetBundle(bundle) {
    const errors = [];
    if (!bundle || typeof bundle !== 'object') {
      return { valid: false, errors: ['Preset bundle must be a non-null object.'] };
    }

    if (bundle.format !== FORMAT_IDENTIFIER) {
      errors.push(`Invalid format identifier: expected "${FORMAT_IDENTIFIER}", got "${bundle.format}".`);
    }

    if (!bundle.version || typeof bundle.version !== 'string') {
      errors.push('Missing or invalid format version string.');
    }

    if (!bundle.presets || typeof bundle.presets !== 'object') {
      errors.push('Preset bundle must contain a "presets" object.');
    } else {
      const { transforms, prompts, customProviders, workflows } = bundle.presets;
      if (transforms !== undefined && !Array.isArray(transforms)) {
        errors.push('"presets.transforms" must be an array.');
      }
      if (prompts !== undefined && !Array.isArray(prompts)) {
        errors.push('"presets.prompts" must be an array.');
      }
      if (customProviders !== undefined && !Array.isArray(customProviders)) {
        errors.push('"presets.customProviders" must be an array.');
      }
      if (workflows !== undefined && !Array.isArray(workflows)) {
        errors.push('"presets.workflows" must be an array.');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  function exportPresetBundle({
    meta = {},
    transforms = [],
    prompts = [],
    customProviders = [],
    workflows = [],
    smartRouterProfile = 'balanced',
    includeApiKeys = false
  } = {}) {
    const cleanTransforms = (Array.isArray(transforms) ? transforms : []).map((t) => ({
      id: sanitizeString(t.id) || `transform_${Date.now().toString(36)}`,
      name: sanitizeString(t.name) || 'Custom Transform',
      systemInstruction: sanitizeString(t.systemInstruction),
      shortcut: sanitizeString(t.shortcut),
      isDefault: Boolean(t.isDefault)
    }));

    const cleanPrompts = (Array.isArray(prompts) ? prompts : []).map((p) => ({
      id: sanitizeString(p.id) || `prompt_${Date.now().toString(36)}`,
      title: sanitizeString(p.title) || 'Prompt Template',
      description: sanitizeString(p.description),
      content: sanitizeString(p.content),
      tags: Array.isArray(p.tags) ? p.tags.map((tag) => sanitizeString(tag)).filter(Boolean) : [],
      variables: Array.isArray(p.variables) ? p.variables : [],
      currentVersion: typeof p.currentVersion === 'number' ? p.currentVersion : 1,
      versions: Array.isArray(p.versions) ? p.versions : []
    }));

    const cleanCustomProviders = (Array.isArray(customProviders) ? customProviders : []).map((cp) => ({
      id: sanitizeString(cp.id) || `custom_${Date.now().toString(36)}`,
      name: sanitizeString(cp.name) || 'Custom Provider',
      baseUrl: sanitizeString(cp.baseUrl || cp.endpoint),
      defaultModel: sanitizeString(cp.defaultModel || cp.model || 'default'),
      apiKey: includeApiKeys ? sanitizeString(cp.apiKey) : '',
      customHeaders: cp.customHeaders && typeof cp.customHeaders === 'object' ? { ...cp.customHeaders } : {}
    }));

    const cleanWorkflows = (Array.isArray(workflows) ? workflows : []).map((w) => ({
      id: sanitizeString(w.id) || `workflow_${Date.now().toString(36)}`,
      name: sanitizeString(w.name) || 'Custom Workflow',
      description: sanitizeString(w.description),
      builtin: Boolean(w.builtin),
      steps: Array.isArray(w.steps) ? w.steps.map((s, idx) => ({
        id: sanitizeString(s.id) || `step-${idx + 1}`,
        name: sanitizeString(s.name) || `Step ${idx + 1}`,
        instruction: sanitizeString(s.instruction),
        provider: sanitizeString(s.provider) || undefined,
        model: sanitizeString(s.model) || undefined,
        stopOnError: s.stopOnError !== undefined ? Boolean(s.stopOnError) : true
      })) : []
    }));

    return {
      format: FORMAT_IDENTIFIER,
      version: FORMAT_VERSION,
      meta: {
        id: sanitizeString(meta.id) || `preset_${Date.now().toString(36)}`,
        name: sanitizeString(meta.name) || 'Zeus Shared Preset',
        description: sanitizeString(meta.description),
        author: sanitizeString(meta.author) || 'Zeus Engineer',
        exportedAt: new Date().toISOString()
      },
      presets: {
        transforms: cleanTransforms,
        prompts: cleanPrompts,
        customProviders: cleanCustomProviders,
        workflows: cleanWorkflows,
        smartRouterProfile: sanitizeString(smartRouterProfile) || 'balanced'
      }
    };
  }

  function parsePresetJson(jsonString) {
    if (typeof jsonString !== 'string' || !jsonString.trim()) {
      throw new Error('Preset JSON payload cannot be empty.');
    }
    try {
      return JSON.parse(jsonString);
    } catch (err) {
      throw new Error(`Failed to parse preset JSON: ${err.message}`);
    }
  }

  function generatePresetJson(bundle, pretty = true) {
    return JSON.stringify(bundle, null, pretty ? 2 : 0);
  }

  function importPresetBundle(bundle, currentState = {}, options = {}) {
    const validation = validatePresetBundle(bundle);
    if (!validation.valid) {
      throw new Error(`Invalid preset bundle: ${validation.errors.join('; ')}`);
    }

    const mode = options.mode || 'merge'; // 'merge' | 'overwrite' | 'replace-all'
    const importedPresets = bundle.presets || {};
    const importedTransforms = Array.isArray(importedPresets.transforms) ? importedPresets.transforms : [];
    const importedPrompts = Array.isArray(importedPresets.prompts) ? importedPresets.prompts : [];
    const importedProviders = Array.isArray(importedPresets.customProviders) ? importedPresets.customProviders : [];
    const importedWorkflows = Array.isArray(importedPresets.workflows) ? importedPresets.workflows : [];
    const importedRouterProfile = importedPresets.smartRouterProfile;

    const currentTransforms = Array.isArray(currentState.transforms) ? [...currentState.transforms] : [];
    const currentPrompts = Array.isArray(currentState.prompts) ? [...currentState.prompts] : [];
    const currentProviders = Array.isArray(currentState.customProviders) ? [...currentState.customProviders] : [];
    const currentWorkflows = Array.isArray(currentState.workflows) ? [...currentState.workflows] : [];

    let nextTransforms = [];
    let nextPrompts = [];
    let nextProviders = [];
    let nextWorkflows = [];

    if (mode === 'replace-all') {
      nextTransforms = [...importedTransforms];
      nextPrompts = [...importedPrompts];
      nextProviders = importedProviders.map((p) => ({ ...p, apiKey: p.apiKey || '' }));
      nextWorkflows = [...importedWorkflows];
    } else if (mode === 'overwrite') {
      // Overwrite transforms by id
      const transformMap = new Map(currentTransforms.map((t) => [t.id, t]));
      for (const t of importedTransforms) {
        transformMap.set(t.id, t);
      }
      nextTransforms = Array.from(transformMap.values());

      // Overwrite prompts by id
      const promptMap = new Map(currentPrompts.map((p) => [p.id, p]));
      for (const p of importedPrompts) {
        promptMap.set(p.id, p);
      }
      nextPrompts = Array.from(promptMap.values());

      // Overwrite custom providers by id
      const providerMap = new Map(currentProviders.map((cp) => [cp.id, cp]));
      for (const cp of importedProviders) {
        const existing = providerMap.get(cp.id);
        providerMap.set(cp.id, {
          ...cp,
          apiKey: existing?.apiKey || cp.apiKey || ''
        });
      }
      nextProviders = Array.from(providerMap.values());

      // Overwrite workflows by id
      const workflowMap = new Map(currentWorkflows.map((w) => [w.id, w]));
      for (const w of importedWorkflows) {
        workflowMap.set(w.id, w);
      }
      nextWorkflows = Array.from(workflowMap.values());
    } else {
      // Default: 'merge' (safe, non-destructive, conflict-avoidant)
      nextTransforms = [...currentTransforms];
      const existingTransformIds = new Set(nextTransforms.map((t) => t.id));
      const existingShortcuts = new Set(nextTransforms.map((t) => t.shortcut).filter(Boolean));

      for (const t of importedTransforms) {
        const copy = { ...t };
        if (existingTransformIds.has(copy.id)) {
          copy.id = `${copy.id}_imported_${Math.random().toString(36).substring(2, 6)}`;
        }
        if (copy.shortcut && existingShortcuts.has(copy.shortcut)) {
          // Prevent shortcut collision in merge mode
          copy.shortcut = '';
        }
        existingTransformIds.add(copy.id);
        if (copy.shortcut) existingShortcuts.add(copy.shortcut);
        nextTransforms.push(copy);
      }

      nextPrompts = [...currentPrompts];
      const existingPromptIds = new Set(nextPrompts.map((p) => p.id));
      for (const p of importedPrompts) {
        const copy = { ...p };
        if (existingPromptIds.has(copy.id)) {
          copy.id = `${copy.id}_imported_${Math.random().toString(36).substring(2, 6)}`;
        }
        existingPromptIds.add(copy.id);
        nextPrompts.push(copy);
      }

      nextProviders = [...currentProviders];
      const existingProviderIds = new Set(nextProviders.map((p) => p.id));
      for (const cp of importedProviders) {
        const copy = { ...cp, apiKey: cp.apiKey || '' };
        if (existingProviderIds.has(copy.id)) {
          copy.id = `${copy.id}_imported_${Math.random().toString(36).substring(2, 6)}`;
        }
        existingProviderIds.add(copy.id);
        nextProviders.push(copy);
      }

      nextWorkflows = [...currentWorkflows];
      const existingWorkflowIds = new Set(nextWorkflows.map((w) => w.id));
      for (const w of importedWorkflows) {
        const copy = { ...w };
        if (existingWorkflowIds.has(copy.id)) {
          copy.id = `${copy.id}_imported_${Math.random().toString(36).substring(2, 6)}`;
        }
        existingWorkflowIds.add(copy.id);
        nextWorkflows.push(copy);
      }
    }

    const nextRouterProfile = importedRouterProfile || currentState.smartRouterProfile || 'balanced';

    return {
      success: true,
      stats: {
        transformsCount: importedTransforms.length,
        promptsCount: importedPrompts.length,
        customProvidersCount: importedProviders.length,
        workflowsCount: importedWorkflows.length,
        smartRouterProfile: importedRouterProfile || null
      },
      nextState: {
        transforms: nextTransforms,
        prompts: nextPrompts,
        customProviders: nextProviders,
        workflows: nextWorkflows,
        smartRouterProfile: nextRouterProfile
      }
    };
  }

  const presetsModule = {
    FORMAT_IDENTIFIER,
    FORMAT_VERSION,
    validatePresetBundle,
    exportPresetBundle,
    parsePresetJson,
    generatePresetJson,
    importPresetBundle
  };

  globalScope.ZeusPresets = presetsModule;
})(typeof globalThis !== 'undefined' ? globalThis : this);
