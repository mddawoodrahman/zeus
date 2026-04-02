(function initGeminiProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const providers = providerUtils.ensureProviderBag();

  const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
  const GEMINI_MAX_RETRIES = 2;

  function extractSignal(errData) {
    const code = String(errData?.error?.code ?? errData?.code ?? '').toLowerCase();
    const status = String(errData?.error?.status ?? errData?.status ?? '').toLowerCase();
    const message = String(errData?.error?.message ?? errData?.message ?? '').toLowerCase();
    return `${code} ${status} ${message}`.trim();
  }

  function shouldFallback(status, errData) {
    const signal = extractSignal(errData);
    if (status === 404 || status === 429) return true;

    return (
      signal.includes('resource_exhausted') ||
      signal.includes('quota') ||
      signal.includes('rate limit') ||
      signal.includes('model_not_found') ||
      signal.includes('not found')
    );
  }

  function isRetryable(status, errData) {
    const signal = extractSignal(errData);
    if ([408, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }

    return (
      signal.includes('temporarily unavailable') ||
      signal.includes('backend error') ||
      signal.includes('internal error')
    );
  }

  async function enhance(prompt, config) {
    const apiKey = String(config?.apiKeys?.gemini || '').trim();
    const model = String(config?.models?.gemini || '').trim();
    if (!apiKey) throw new Error('Missing Gemini API key.');
    if (!model) throw new Error('Missing Gemini model.');

    const body = {
      contents: [{ parts: [{ text: prompts.buildEnhancePrompt(prompt) }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
    };

    const modelCandidates = providerUtils.buildModelCandidates('gemini', model);
    let lastError = null;

    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      const currentModel = modelCandidates[modelIndex];
      const apiUrl = `${GEMINI_API_BASE_URL}/${currentModel}:generateContent?key=${apiKey}`;

      for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt += 1) {
        const response = await retry.fetchWithTimeout(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await providerUtils.readJsonSafe(response);
          const enhancedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!enhancedText) throw new Error('Provider responded without enhanced text.');
          return String(enhancedText).trim();
        }

        const errData = await providerUtils.readJsonSafe(response);
        lastError = new errors.ProviderHttpError('gemini', response.status, errData, currentModel);

        if (modelIndex < modelCandidates.length - 1 && shouldFallback(response.status, errData)) {
          providerUtils.trackFallbackEvent({
            provider: 'gemini',
            fromModel: currentModel,
            toModel: modelCandidates[modelIndex + 1],
            reasonCode: response.status,
            reason: extractSignal(errData),
            stage: 'model-candidate'
          });
          break;
        }

        const canRetry = attempt < GEMINI_MAX_RETRIES - 1 && isRetryable(response.status, errData);
        if (canRetry) {
          await retry.waitWithBackoff(attempt);
          continue;
        }

        throw lastError;
      }
    }

    if (lastError) throw lastError;
    throw new Error('Gemini request failed.');
  }

  providers.gemini = enhance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
