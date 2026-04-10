(function initOpenAIProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const providers = providerUtils.ensureProviderBag();

  const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
  const OPENAI_MAX_RETRIES = 3;

  function extractSignal(errData) {
    const code = String(errData?.error?.code ?? errData?.code ?? '').toLowerCase();
    const type = String(errData?.error?.type ?? errData?.type ?? '').toLowerCase();
    const message = String(errData?.error?.message ?? errData?.message ?? '').toLowerCase();
    return `${code} ${type} ${message}`.trim();
  }

  function shouldFallback(status, errData) {
    const signal = extractSignal(errData);
    if (status === 404) return true;

    return (
      signal.includes('model_not_found') ||
      signal.includes('does not exist') ||
      signal.includes('not found') ||
      signal.includes('you do not have access') ||
      signal.includes('insufficient_quota') ||
      signal.includes('quota exceeded') ||
      signal.includes('exceeded your current quota')
    );
  }

  function isRetryable(status, errData) {
    const signal = extractSignal(errData);
    if ([408, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }

    return (
      signal.includes('temporarily unavailable') ||
      signal.includes('server had an error') ||
      signal.includes('overloaded')
    );
  }

  async function enhance(prompt, config) {
    const apiKey = String(config?.apiKeys?.openai || '').trim();
    const model = String(config?.models?.openai || '').trim();
    if (!apiKey) throw new Error('Missing OpenAI API key.');
    if (!model) throw new Error('Missing OpenAI model.');

    const modelCandidates = providerUtils.buildModelCandidates('openai', model);
    let lastError = null;

    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      const currentModel = modelCandidates[modelIndex];
      let tokenParam = providerUtils.inferChatTokenParam('openai', currentModel);

      for (let attempt = 0; attempt < OPENAI_MAX_RETRIES; attempt += 1) {
        const body = {
          model: currentModel,
          messages: [
            { role: 'system', content: prompts.getRewriteSystemInstruction() },
            { role: 'user', content: prompts.buildEnhancePrompt(prompt) }
          ],
          temperature: 0.4,
          ...providerUtils.buildChatTokenLimit(tokenParam, 1024)
        };

        const response = await retry.fetchWithTimeout(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
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
        lastError = new errors.ProviderHttpError('openai', response.status, errData, currentModel);

        if (response.status === 400 && providerUtils.isUnsupportedTokenParameterError(errData, tokenParam)) {
          const alternateParam = providerUtils.getAlternateChatTokenParam(tokenParam);
          if (alternateParam) {
            tokenParam = alternateParam;
            continue;
          }
        }

        if (modelIndex < modelCandidates.length - 1 && shouldFallback(response.status, errData)) {
          providerUtils.trackFallbackEvent({
            provider: 'openai',
            fromModel: currentModel,
            toModel: modelCandidates[modelIndex + 1],
            reasonCode: response.status,
            reason: extractSignal(errData),
            stage: 'model-candidate'
          });
          break;
        }

        const canRetry = attempt < OPENAI_MAX_RETRIES - 1 && isRetryable(response.status, errData);
        if (canRetry) {
          await retry.waitWithBackoff(attempt);
          continue;
        }

        throw lastError;
      }
    }

    if (lastError) throw lastError;
    throw new Error('OpenAI request failed.');
  }

  providers.openai = enhance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
