(function initOpenRouterProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const providers = providerUtils.ensureProviderBag();

  const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
  const OPENROUTER_APP_REFERER = 'https://zeus-extension.local';
  const OPENROUTER_APP_TITLE = 'Zeus Prompt Enhancer';
  const OPENROUTER_MAX_RETRIES = 3;
  const OPENROUTER_CATALOG_TTL_MS = 10 * 60 * 1000;

  let catalogCache = {
    expiresAt: 0,
    models: []
  };

  function extractSignal(errData) {
    const code = String(errData?.error?.code ?? errData?.code ?? '').toLowerCase();
    const type = String(errData?.error?.type ?? errData?.type ?? '').toLowerCase();
    const message = String(errData?.error?.message ?? errData?.message ?? '').toLowerCase();
    return `${code} ${type} ${message}`.trim();
  }

  function shouldFallback(status, errData) {
    const signal = extractSignal(errData);
    if (status === 404 || status === 429) return true;

    return (
      (signal.includes('model') && (
        signal.includes('not found') ||
        signal.includes('does not exist') ||
        signal.includes('unsupported')
      )) ||
      signal.includes('insufficient_quota') ||
      signal.includes('quota')
    );
  }

  function isRetryable(status, errData) {
    const signal = extractSignal(errData);
    if ([408, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }

    return (
      signal.includes('temporarily unavailable') ||
      signal.includes('timeout') ||
      signal.includes('overloaded')
    );
  }

  function extractModelIds(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  async function fetchCatalog(apiKey) {
    const now = Date.now();
    if (catalogCache.expiresAt > now && catalogCache.models.length > 0) {
      return catalogCache.models;
    }

    try {
      const response = await retry.fetchWithTimeout(OPENROUTER_MODELS_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': OPENROUTER_APP_REFERER,
          'X-Title': OPENROUTER_APP_TITLE
        }
      }, 8000);

      if (!response.ok) {
        return [];
      }

      const data = await providerUtils.readJsonSafe(response);
      const models = extractModelIds(data);
      catalogCache = {
        expiresAt: now + OPENROUTER_CATALOG_TTL_MS,
        models
      };

      return models;
    } catch (_) {
      return [];
    }
  }

  async function buildModelCandidates(preferredModel, apiKey) {
    const dynamicModels = await fetchCatalog(apiKey);
    return providerUtils.buildModelCandidates('openrouter', preferredModel, dynamicModels);
  }

  async function enhance(prompt, config) {
    const apiKey = String(config?.apiKeys?.openrouter || '').trim();
    const model = String(config?.models?.openrouter || '').trim();
    if (!apiKey) throw new Error('Missing OpenRouter API key.');
    if (!model) throw new Error('Missing OpenRouter model.');

    const modelCandidates = await buildModelCandidates(model, apiKey);
    let lastError = null;

    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      const currentModel = modelCandidates[modelIndex];
      let tokenParam = providerUtils.inferChatTokenParam('openrouter', currentModel);

      for (let attempt = 0; attempt < OPENROUTER_MAX_RETRIES; attempt += 1) {
        const body = {
          model: currentModel,
          messages: [
            { role: 'system', content: prompts.getRewriteSystemInstruction() },
            { role: 'user', content: prompts.buildEnhancePrompt(prompt) }
          ],
          temperature: 0.4,
          ...providerUtils.buildChatTokenLimit(tokenParam, 2048)
        };

        const response = await retry.fetchWithTimeout(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': OPENROUTER_APP_REFERER,
            'X-Title': OPENROUTER_APP_TITLE
          },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await providerUtils.readJsonSafe(response);
          const enhancedText = data?.choices?.[0]?.message?.content;
          if (!enhancedText) throw new Error('Provider responded without enhanced text.');
          return String(enhancedText).trim();
        }

        const errData = await providerUtils.readJsonSafe(response);
        lastError = new errors.ProviderHttpError('openrouter', response.status, errData, currentModel);

        if (response.status === 400 && providerUtils.isUnsupportedTokenParameterError(errData, tokenParam)) {
          const alternateParam = providerUtils.getAlternateChatTokenParam(tokenParam);
          if (alternateParam) {
            tokenParam = alternateParam;
            continue;
          }
        }

        if (modelIndex < modelCandidates.length - 1 && shouldFallback(response.status, errData)) {
          providerUtils.trackFallbackEvent({
            provider: 'openrouter',
            fromModel: currentModel,
            toModel: modelCandidates[modelIndex + 1],
            reasonCode: response.status,
            reason: extractSignal(errData),
            stage: 'model-candidate'
          });
          break;
        }

        const canRetry = attempt < OPENROUTER_MAX_RETRIES - 1 && isRetryable(response.status, errData);
        if (canRetry) {
          await retry.waitWithBackoff(attempt);
          continue;
        }

        throw lastError;
      }
    }

    if (lastError) throw lastError;
    throw new Error('OpenRouter request failed.');
  }

  async function suggest(text, settings, port, signal) {
    const apiKey = String(settings?.apiKeys?.openrouter || '').trim();
    const model = String(settings?.models?.openrouter || 'openai/gpt-5.4').trim();
    if (!apiKey) throw new Error('Missing OpenRouter API key.');

    const body = {
      model,
      messages: [
        { role: 'system', content: "You are a concise prompt-completion assistant. Continue the user's incomplete prompt with at most 2 sentences. Do not repeat what they already typed." },
        { role: 'user', content: `Prompt: ${text}` }
      ],
      temperature: 0.3,
      max_tokens: settings.copilotMaxTokens || 60
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/zeus-extension',
        'X-Title': 'Zeus Prompt Injector'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errData = await providerUtils.readJsonSafe(response);
      throw new Error(errData?.error?.message || `HTTP error ${response.status}`);
    }

    const data = await providerUtils.readJsonSafe(response);
    const content = data?.choices?.[0]?.message?.content;
    if (content && !signal?.aborted) {
      port.postMessage({ type: 'chunk', text: String(content).trim() });
    }

    if (!signal?.aborted) {
      port.postMessage({ type: 'done' });
    }
  }

  providers.openrouter = enhance;
  providers.openrouter.suggest = suggest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
