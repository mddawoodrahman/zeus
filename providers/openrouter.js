(function initOpenRouterProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const transport = globalScope.ZeusProviderTransport || (typeof require !== 'undefined' ? (function() {
    try {
      const path = require('node:path');
      return require(path.resolve(process.cwd(), 'core/providerTransport.js'));
    } catch (_) {
      try {
        return require('../core/providerTransport.js');
      } catch (_2) {
        return null;
      }
    }
  })() : null);
  const providers = providerUtils.ensureProviderBag();

  const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const OPENROUTER_APP_REFERER = 'https://zeus-extension.local';
  const OPENROUTER_APP_TITLE = 'Zeus Prompt Enhancer';
  const OPENROUTER_MAX_RETRIES = 3;

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

  async function enhance(prompt, config) {
    const apiKey = String(config?.apiKeys?.openrouter || '').trim();
    const model = String(config?.models?.openrouter || '').trim();
    if (!apiKey) throw new Error('Missing OpenRouter API key.');
    if (!model) throw new Error('Missing OpenRouter model.');

    const signal = config?.signal;
    const modelCandidates = providerUtils.buildModelCandidates('openrouter', model);
    let lastError = null;

    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      if (signal?.aborted) break;
      const currentModel = modelCandidates[modelIndex];
      let tokenParam = providerUtils.inferChatTokenParam('openrouter', currentModel);
      let includeTemperature = providerUtils.supportsSamplingTemperature('openrouter', currentModel);

      for (let attempt = 0; attempt < OPENROUTER_MAX_RETRIES; attempt += 1) {
        if (signal?.aborted) break;
        const body = {
          model: currentModel,
          messages: [
            { role: 'system', content: prompts.getRewriteSystemInstruction() },
            { role: 'user', content: prompts.buildEnhancePrompt(prompt) }
          ],
          ...providerUtils.buildChatCompletionOptions('openrouter', currentModel, {
            temperature: 0.4,
            maxTokens: 2048,
            tokenParam,
            includeTemperature
          })
        };

        const result = await (transport ? transport.execute({
          url: OPENROUTER_API_URL,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': OPENROUTER_APP_REFERER,
            'X-Title': OPENROUTER_APP_TITLE
          },
          body,
          signal,
          maxRetries: 1,
          provider: 'openrouter'
        }) : (async () => {
          const response = await retry.fetchWithTimeout(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': OPENROUTER_APP_REFERER,
              'X-Title': OPENROUTER_APP_TITLE
            },
            body: JSON.stringify(body)
          }, undefined, signal);
          const data = await providerUtils.readJsonSafe(response);
          return { ok: response.ok, status: response.status, data };
        })());

        if (result.ok) {
          const enhancedText = result.data?.choices?.[0]?.message?.content;
          if (!enhancedText) throw new Error('Provider responded without enhanced text.');
          return String(enhancedText).trim();
        }

        const errData = result.data || {};
        lastError = new errors.ProviderHttpError('openrouter', result.status, errData, currentModel);

        if (result.status === 400 && providerUtils.isUnsupportedTokenParameterError(errData, tokenParam)) {
          const alternateParam = providerUtils.getAlternateChatTokenParam(tokenParam);
          if (alternateParam) {
            tokenParam = alternateParam;
            continue;
          }
        }

        if (result.status === 400 && includeTemperature && providerUtils.isUnsupportedTemperatureError(errData)) {
          includeTemperature = false;
          continue;
        }

        if (modelIndex < modelCandidates.length - 1 && shouldFallback(result.status, errData)) {
          providerUtils.trackFallbackEvent({
            provider: 'openrouter',
            fromModel: currentModel,
            toModel: modelCandidates[modelIndex + 1],
            reasonCode: result.status,
            reason: extractSignal(errData),
            stage: 'model-candidate'
          });
          break;
        }

        const canRetry = attempt < OPENROUTER_MAX_RETRIES - 1 && isRetryable(result.status, errData);
        if (canRetry) {
          await retry.waitWithBackoff(attempt, undefined, undefined, signal);
          continue;
        }

        throw lastError;
      }
    }

    if (signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
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
      ...providerUtils.buildChatCompletionOptions('openrouter', model, {
        temperature: 0.3,
        maxTokens: settings.copilotMaxTokens || 60
      }),
      stream: true
    };

    if (transport && typeof transport.stream === 'function') {
      await transport.stream({
        url: OPENROUTER_API_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': OPENROUTER_APP_REFERER,
          'X-Title': OPENROUTER_APP_TITLE
        },
        body,
        decoder: 'sse',
        provider: 'openrouter',
        signal
      }, {
        signal,
        onChunk: (chunk) => {
          const content = chunk?.choices?.[0]?.delta?.content || chunk?.choices?.[0]?.message?.content;
          if (content && !signal?.aborted) {
            port.postMessage({ type: 'chunk', text: content });
          }
        }
      });
    } else {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': OPENROUTER_APP_REFERER,
          'X-Title': OPENROUTER_APP_TITLE
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const errData = await providerUtils.readJsonSafe(response);
        throw new Error(errData?.error?.message || `HTTP error ${response.status}`);
      }

      await providerUtils.parseSseStream(response, (chunk) => {
        const content = chunk?.choices?.[0]?.delta?.content || chunk?.choices?.[0]?.message?.content;
        if (content && !signal?.aborted) {
          port.postMessage({ type: 'chunk', text: content });
        }
      }, signal);
    }

    if (!signal?.aborted) {
      port.postMessage({ type: 'done' });
    }
  }

  providers.openrouter = enhance;
  providers.openrouter.suggest = suggest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
