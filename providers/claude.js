(function initClaudeProvider(globalScope) {
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

    const signal = config?.signal;
    const modelCandidates = providerUtils.buildModelCandidates('claude', model);
    let lastError = null;

    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      if (signal?.aborted) break;
      const currentModel = modelCandidates[modelIndex];

      for (let attempt = 0; attempt < CLAUDE_MAX_RETRIES; attempt += 1) {
        if (signal?.aborted) break;
        const body = {
          model: currentModel,
          system: prompts.getRewriteSystemInstruction(),
          messages: [{ role: 'user', content: prompts.buildEnhancePrompt(prompt) }],
          max_tokens: 2048,
          temperature: 0.4
        };

        const result = await (transport ? transport.execute({
          url: CLAUDE_API_URL,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body,
          signal,
          maxRetries: 1,
          provider: 'claude'
        }) : (async () => {
          const response = await retry.fetchWithTimeout(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
          }, undefined, signal);
          const data = await providerUtils.readJsonSafe(response);
          return { ok: response.ok, status: response.status, data };
        })());

        if (result.ok) {
          const enhancedText = result.data?.content?.[0]?.text;
          if (!enhancedText) throw new Error('Provider responded without enhanced text.');
          return String(enhancedText).trim();
        }

        const errData = result.data || {};
        lastError = new errors.ProviderHttpError('claude', result.status, errData, currentModel);

        if (modelIndex < modelCandidates.length - 1 && shouldFallback(result.status, errData)) {
          providerUtils.trackFallbackEvent({
            provider: 'claude',
            fromModel: currentModel,
            toModel: modelCandidates[modelIndex + 1],
            reasonCode: result.status,
            reason: extractSignal(errData),
            stage: 'model-candidate'
          });
          break;
        }

        const canRetry = attempt < CLAUDE_MAX_RETRIES - 1 && isRetryable(result.status, errData);
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
    throw new Error('Claude request failed.');
  }

  async function suggest(text, settings, port, signal) {
    const apiKey = String(settings?.apiKeys?.claude || '').trim();
    const model = String(settings?.models?.claude || 'claude-sonnet-4.6').trim();
    if (!apiKey) throw new Error('Missing Claude API key.');

    const body = {
      model,
      system: "You are a concise prompt-completion assistant. Continue the user's incomplete prompt with at most 2 sentences. Do not repeat what they already typed.",
      messages: [{ role: 'user', content: `Prompt: ${text}` }],
      max_tokens: settings.copilotMaxTokens || 60,
      temperature: 0.3,
      stream: true
    };

    if (transport && typeof transport.stream === 'function') {
      await transport.stream({
        url: CLAUDE_API_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body,
        decoder: 'sse',
        provider: 'claude',
        signal
      }, {
        signal,
        onChunk: (chunk) => {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            const content = chunk.delta.text;
            if (content && !signal?.aborted) {
              port.postMessage({ type: 'chunk', text: content });
            }
          }
        }
      });
    } else {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const errData = await providerUtils.readJsonSafe(response);
        throw new Error(errData?.error?.message || `HTTP error ${response.status}`);
      }

      await providerUtils.parseSseStream(response, (chunk) => {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          const content = chunk.delta.text;
          if (content && !signal?.aborted) {
            port.postMessage({ type: 'chunk', text: content });
          }
        }
      }, signal);
    }

    if (!signal?.aborted) {
      port.postMessage({ type: 'done' });
    }
  }

  providers.claude = enhance;
  providers.claude.suggest = suggest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
