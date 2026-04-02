(function initClaudeProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const providers = providerUtils.ensureProviderBag();

  const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
  const CLAUDE_MAX_RETRIES = 3;

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
      (signal.includes('model') && (
        signal.includes('not found') ||
        signal.includes('does not exist') ||
        signal.includes('unsupported')
      )) ||
      signal.includes('insufficient') ||
      signal.includes('quota') ||
      signal.includes('credit balance') ||
      signal.includes('resource exhausted')
    );
  }

  function isRetryable(status, errData) {
    const signal = extractSignal(errData);
    if ([408, 429, 500, 502, 503, 504, 529].includes(status)) {
      return true;
    }

    return (
      signal.includes('overloaded') ||
      signal.includes('temporarily unavailable') ||
      signal.includes('timeout')
    );
  }

  async function enhance(prompt, config) {
    const apiKey = String(config?.apiKeys?.claude || '').trim();
    const model = String(config?.models?.claude || '').trim();
    if (!apiKey) throw new Error('Missing Claude API key.');
    if (!model) throw new Error('Missing Claude model.');

    const modelCandidates = providerUtils.buildModelCandidates('claude', model);
    let lastError = null;

    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      const currentModel = modelCandidates[modelIndex];

      for (let attempt = 0; attempt < CLAUDE_MAX_RETRIES; attempt += 1) {
        const body = {
          model: currentModel,
          system: prompts.getRewriteSystemInstruction(),
          messages: [{ role: 'user', content: prompts.buildEnhancePrompt(prompt) }],
          max_tokens: 2048,
          temperature: 0.4
        };

        const response = await retry.fetchWithTimeout(CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await providerUtils.readJsonSafe(response);
          const enhancedText = data?.content?.[0]?.text;
          if (!enhancedText) throw new Error('Provider responded without enhanced text.');
          return String(enhancedText).trim();
        }

        const errData = await providerUtils.readJsonSafe(response);
        lastError = new errors.ProviderHttpError('claude', response.status, errData, currentModel);

        if (modelIndex < modelCandidates.length - 1 && shouldFallback(response.status, errData)) {
          providerUtils.trackFallbackEvent({
            provider: 'claude',
            fromModel: currentModel,
            toModel: modelCandidates[modelIndex + 1],
            reasonCode: response.status,
            reason: extractSignal(errData),
            stage: 'model-candidate'
          });
          break;
        }

        const canRetry = attempt < CLAUDE_MAX_RETRIES - 1 && isRetryable(response.status, errData);
        if (canRetry) {
          await retry.waitWithBackoff(attempt);
          continue;
        }

        throw lastError;
      }
    }

    if (lastError) throw lastError;
    throw new Error('Claude request failed.');
  }

  providers.claude = enhance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
