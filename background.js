globalThis.LOG_PREFIX = {
  info: '%c[ZEUS_NET]',
  warn: '%c[ZEUS_NET]',
  error: '%c[ZEUS_NET]',
  success: '%c[ZEUS_NET]'
};

globalThis.LOG_STYLE = {
  info: 'color: #00F0FF; font-family: JetBrains Mono; font-weight: bold;',
  warn: 'color: #FCEE0A; font-family: JetBrains Mono; font-weight: bold;',
  error: 'color: #FF003C; font-family: JetBrains Mono; font-weight: bold;',
  success: 'color: #39FF14; font-family: JetBrains Mono; font-weight: bold;'
};

importScripts(
  'model-registry.js',
  'settings/settings.js',
  'core/retry.js',
  'core/prompts.js',
  'core/errors.js',
  'core/telemetry.js',
  'providers/utils.js',
  'providers/gemini.js',
  'providers/openai.js',
  'providers/claude.js',
  'providers/openrouter.js',
  'providers/ollama.js',
  'core/router.js',
  'messaging/messageHandler.js'
);
