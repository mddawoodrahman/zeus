(function initZeusModelRegistry(globalScope) {
  const MODEL_GROUP = {
    RECOMMENDED: 'recommended',
    FAST_CHEAP: 'fast-cheap',
    HIGH_INTELLIGENCE: 'high-intelligence',
    CODING_AGENTS: 'coding-agents'
  };

  const GROUP_LABELS = {
    [MODEL_GROUP.RECOMMENDED]: 'Recommended (Latest)',
    [MODEL_GROUP.FAST_CHEAP]: 'Fast / Cheap',
    [MODEL_GROUP.HIGH_INTELLIGENCE]: 'High Intelligence',
    [MODEL_GROUP.CODING_AGENTS]: 'Coding / Agents'
  };

  const PROVIDERS = {
    gemini: {
      label: 'Gemini',
      helper: 'Great balance for speed and cost. Best quick option: gemini-3-flash.',
      defaultModel: 'gemini-3-flash',
      fallbackModels: ['gemini-3-flash', 'gemini-3-pro', 'gemini-2.5-flash', 'gemini-2.5-pro'],
      models: [
        {
          id: 'gemini-3.1-pro',
          label: 'Gemini 3.1 Pro',
          badge: 'Latest',
          speed: 'medium',
          cost: 'high',
          group: MODEL_GROUP.HIGH_INTELLIGENCE,
          bestFor: ['reasoning', 'analysis', 'complex prompts']
        },
        {
          id: 'gemini-3-pro',
          label: 'Gemini 3 Pro',
          badge: 'Latest',
          speed: 'medium',
          cost: 'high',
          group: MODEL_GROUP.RECOMMENDED,
          bestFor: ['quality', 'reasoning']
        },
        {
          id: 'gemini-3-flash',
          label: 'Gemini 3 Flash',
          badge: 'Fast',
          speed: 'fast',
          cost: 'low',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['cheap runs', 'high throughput']
        },
        {
          id: 'gemini-2.5-pro',
          label: 'Gemini 2.5 Pro',
          badge: 'Stable',
          speed: 'medium',
          cost: 'medium',
          group: MODEL_GROUP.HIGH_INTELLIGENCE,
          bestFor: ['general quality']
        },
        {
          id: 'gemini-2.5-flash',
          label: 'Gemini 2.5 Flash',
          badge: 'Cheap',
          speed: 'fast',
          cost: 'low',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['quick rewrite', 'budget']
        }
      ]
    },
    openai: {
      label: 'OpenAI',
      helper: 'Best coding option: gpt-5.3-codex. Best all-round quality: gpt-5.4.',
      defaultModel: 'gpt-5.4-mini',
      fallbackModels: ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5.3-codex'],
      models: [
        {
          id: 'gpt-5.4',
          label: 'GPT-5.4',
          badge: 'Latest',
          speed: 'medium',
          cost: 'high',
          group: MODEL_GROUP.RECOMMENDED,
          bestFor: ['reasoning', 'premium quality']
        },
        {
          id: 'gpt-5.4-mini',
          label: 'GPT-5.4 Mini',
          badge: 'Balanced',
          speed: 'fast',
          cost: 'medium',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['daily usage', 'cost control']
        },
        {
          id: 'gpt-5.4-nano',
          label: 'GPT-5.4 Nano',
          badge: 'Cheap',
          speed: 'fast',
          cost: 'low',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['ultra-low cost', 'fast rewrites']
        },
        {
          id: 'gpt-5.3-codex',
          label: 'GPT-5.3 Codex',
          badge: 'Coding',
          speed: 'medium',
          cost: 'medium',
          group: MODEL_GROUP.CODING_AGENTS,
          bestFor: ['coding', 'agents', 'debugging']
        },
        {
          id: 'gpt-5.2',
          label: 'GPT-5.2',
          badge: 'Stable',
          speed: 'medium',
          cost: 'medium',
          group: MODEL_GROUP.HIGH_INTELLIGENCE,
          bestFor: ['general tasks']
        }
      ]
    },
    claude: {
      label: 'Claude',
      helper: 'Best long-form quality: claude-opus-4.6. Best value: claude-sonnet-4.6.',
      defaultModel: 'claude-sonnet-4.6',
      fallbackModels: ['claude-sonnet-4.6', 'claude-4.5-sonnet', 'claude-opus-4.6', 'claude-4.5-opus'],
      models: [
        {
          id: 'claude-opus-4.6',
          label: 'Claude Opus 4.6',
          badge: 'Latest',
          speed: 'medium',
          cost: 'high',
          group: MODEL_GROUP.RECOMMENDED,
          bestFor: ['long-form', 'deep reasoning']
        },
        {
          id: 'claude-sonnet-4.6',
          label: 'Claude Sonnet 4.6',
          badge: 'Balanced',
          speed: 'fast',
          cost: 'medium',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['daily quality', 'balanced cost']
        },
        {
          id: 'claude-4.5-opus',
          label: 'Claude 4.5 Opus',
          badge: 'Quality',
          speed: 'medium',
          cost: 'high',
          group: MODEL_GROUP.HIGH_INTELLIGENCE,
          bestFor: ['analysis', 'strategy']
        },
        {
          id: 'claude-4.5-sonnet',
          label: 'Claude 4.5 Sonnet',
          badge: 'Stable',
          speed: 'fast',
          cost: 'medium',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['steady workloads']
        }
      ]
    },
    openrouter: {
      label: 'OpenRouter',
      helper: 'Curated top cross-provider models. Good when you want one API key for many model families.',
      defaultModel: 'openai/gpt-5.4',
      fallbackModels: [
        'openai/gpt-5.4',
        'anthropic/claude-opus-4.6',
        'google/gemini-3-pro',
        'mistralai/mistral-large-3',
        'deepseek/deepseek-v3.2',
        'qwen/qwen-3.5'
      ],
      models: [
        {
          id: 'openai/gpt-5.4',
          label: 'OpenAI GPT-5.4',
          badge: 'Latest',
          speed: 'medium',
          cost: 'high',
          group: MODEL_GROUP.RECOMMENDED,
          bestFor: ['best quality']
        },
        {
          id: 'anthropic/claude-opus-4.6',
          label: 'Anthropic Claude Opus 4.6',
          badge: 'Latest',
          speed: 'medium',
          cost: 'high',
          group: MODEL_GROUP.HIGH_INTELLIGENCE,
          bestFor: ['long-form quality']
        },
        {
          id: 'google/gemini-3-pro',
          label: 'Google Gemini 3 Pro',
          badge: 'Latest',
          speed: 'medium',
          cost: 'medium',
          group: MODEL_GROUP.RECOMMENDED,
          bestFor: ['reasoning']
        },
        {
          id: 'mistralai/mistral-large-3',
          label: 'Mistral Large 3',
          badge: 'Fast',
          speed: 'fast',
          cost: 'medium',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['general speed']
        },
        {
          id: 'deepseek/deepseek-v3.2',
          label: 'DeepSeek V3.2',
          badge: 'Coding',
          speed: 'fast',
          cost: 'low',
          group: MODEL_GROUP.CODING_AGENTS,
          bestFor: ['coding', 'reasoning']
        },
        {
          id: 'qwen/qwen-3.5',
          label: 'Qwen 3.5',
          badge: 'Cheap',
          speed: 'fast',
          cost: 'low',
          group: MODEL_GROUP.FAST_CHEAP,
          bestFor: ['budget']
        }
      ]
    },
    ollama: {
      label: 'Ollama',
      helper: 'Local model detection is automatic. Suggested local models are included for quick setup.',
      defaultModel: '',
      fallbackModels: [],
      suggestedLocalModels: [
        'llama4',
        'qwen3:8b',
        'mistral-large',
        'deepseek-coder-v2'
      ],
      models: []
    }
  };

  function getProviderConfig(provider) {
    return PROVIDERS[String(provider || '').toLowerCase()] || null;
  }

  function getProviderModels(provider) {
    const cfg = getProviderConfig(provider);
    return Array.isArray(cfg?.models) ? cfg.models.slice() : [];
  }

  function getModel(provider, modelId) {
    const id = String(modelId || '').trim();
    if (!id) return null;
    const models = getProviderModels(provider);
    return models.find((model) => model.id === id) || null;
  }

  function getDefaultModel(provider) {
    return String(getProviderConfig(provider)?.defaultModel || '').trim();
  }

  function getFallbackModels(provider) {
    const fallbackModels = getProviderConfig(provider)?.fallbackModels;
    return Array.isArray(fallbackModels) ? fallbackModels.slice() : [];
  }

  function getProviderHelper(provider) {
    return String(getProviderConfig(provider)?.helper || '').trim();
  }

  function supportsModelSelection(provider) {
    return getProviderModels(provider).length > 0;
  }

  function getGroupedModels(provider) {
    const grouped = {
      [MODEL_GROUP.RECOMMENDED]: [],
      [MODEL_GROUP.FAST_CHEAP]: [],
      [MODEL_GROUP.HIGH_INTELLIGENCE]: [],
      [MODEL_GROUP.CODING_AGENTS]: []
    };

    for (const model of getProviderModels(provider)) {
      const groupKey = grouped[model.group] ? model.group : MODEL_GROUP.RECOMMENDED;
      grouped[groupKey].push(model);
    }

    return grouped;
  }

  function getGroupLabels() {
    return { ...GROUP_LABELS };
  }

  globalScope.ZeusModelRegistry = Object.freeze({
    modelGroups: Object.freeze({ ...MODEL_GROUP }),
    providers: Object.freeze(PROVIDERS),
    getProviderConfig,
    getProviderModels,
    getModel,
    getDefaultModel,
    getFallbackModels,
    getProviderHelper,
    supportsModelSelection,
    getGroupedModels,
    getGroupLabels
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
