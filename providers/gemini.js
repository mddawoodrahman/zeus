(function initGeminiProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const providers = providerUtils.ensureProviderBag();

  const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const GEMINI_MAX_RETRIES = 3;
  const GEMINI_MAX_OUTPUT_TOKENS = 2048;
  const GEMINI_TEMPERATURE = 0.4;

  function buildEndpoint(model, { stream = false } = {}) {
    const normalizedModel = String(model || '').trim().replace(/^\/+/, '');
    const method = stream ? 'streamGenerateContent' : 'generateContent';
    const query = stream ? '?alt=sse' : '';
    return `${GEMINI_API_BASE}/${encodeURIComponent(normalizedModel)}:${method}${query}`;
  }

  function buildHeaders(apiKey) {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    };
  }

  function extractSignal(errData) {
    const code = String(errData?.error?.status ?? errData?.error?.code ?? errData?.status ?? '').toLowerCase();
    const message = String(errData?.error?.message ?? errData?.message ?? '').toLowerCase();
    return `${code} ${message}`.trim();
  }

  function shouldFallback(status, errData) {
    const signal = extractSignal(errData);
    if (status === 404) return true;

    return (
      signal.includes('not_found') ||
      signal.includes('not found') ||
      signal.includes('is not supported') ||
      signal.includes('unsupported model') ||
      signal.includes('does not exist') ||
      signal.includes('resource_exhausted') ||
      signal.includes('quota')
    );
  }

  function isRetryable(status, errData) {
    const signal = extractSignal(errData);
    if ([408, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }

    return (
      signal.includes('unavailable') ||
      signal.includes('overloaded') ||
      signal.includes('deadline_exceeded') ||
      signal.includes('internal')
    );
  }

  function extractCandidateText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      return '';
    }

    return parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }

  async function enhance(prompt, config) {
    const apiKey = String(config?.apiKeys?.gemini || '').trim();
    const model = String(config?.models?.gemini || '').trim();
    if (!apiKey) throw new Error('Missing Gemini API key.');
    if (!model) throw new Error('Missing Gemini model.');

    const modelCandidates = providerUtils.buildModelCandidates('gemini', model);
    let lastError = null;

    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      const currentModel = modelCandidates[modelIndex];

      for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt += 1) {
        const body = {
          systemInstruction: {
            parts: [{ text: prompts.getRewriteSystemInstruction() }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: prompts.buildEnhancePrompt(prompt) }]
            }
          ],
          generationConfig: {
            temperature: GEMINI_TEMPERATURE,
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS
          }
        };

        const response = await retry.fetchWithTimeout(buildEndpoint(currentModel), {
          method: 'POST',
          headers: buildHeaders(apiKey),
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await providerUtils.readJsonSafe(response);
          const enhancedText = extractCandidateText(data);
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

  async function suggest(text, settings, port, signal) {
    const apiKey = String(settings?.apiKeys?.gemini || '').trim();
    const model = String(settings?.models?.gemini || 'gemini-3-flash').trim();
    if (!apiKey) throw new Error('Missing Gemini API key.');

    const body = {
      systemInstruction: {
        parts: [{
          text: "You are a concise prompt-completion assistant. Continue the user's incomplete prompt with at most 2 sentences. Do not repeat what they already typed."
        }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `Prompt: ${text}` }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: Number(settings?.copilotMaxTokens) > 0 ? Number(settings.copilotMaxTokens) : 60
      }
    };

    const response = await fetch(buildEndpoint(model, { stream: true }), {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errData = await providerUtils.readJsonSafe(response);
      throw new Error(errData?.error?.message || `HTTP error ${response.status}`);
    }

    // streamGenerateContent emits cumulative candidate text, so forward only the
    // newly appended portion of each chunk to keep the ghost-text delta correct.
    let receivedText = '';

    await providerUtils.parseSseStream(response, (chunk) => {
      const fullText = extractCandidateText(chunk);
      if (!fullText) {
        return;
      }

      const delta = fullText.startsWith(receivedText)
        ? fullText.slice(receivedText.length)
        : fullText;

      receivedText = fullText;

      if (delta) {
        port.postMessage({ type: 'chunk', text: delta });
      }
    }, signal);

    if (!signal?.aborted) {
      port.postMessage({ type: 'done' });
    }
  }

  providers.gemini = enhance;
  providers.gemini.suggest = suggest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
