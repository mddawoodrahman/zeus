const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

if (typeof globalThis.require === 'undefined') {
  globalThis.require = require;
}

const ZEUS_GLOBAL_KEYS = [
  'ZeusModelRegistry',
  'ZeusSettings',
  'ZeusSettingsStore',
  'ZeusRetry',
  'ZeusPrompts',
  'ZeusErrors',
  'ZeusProviderUtils',
  'ZeusProviderTransport',
  'ZeusProviders',
  'ZeusRouter',
  'ZeusTelemetry',
  'ZeusEditorBridge',
  'ZeusPromptClient',
  'ZeusDomUtils',
  'ZeusFloatingPosition',
  'ZeusInjector',
  'ZeusObserver',
  'ZeusContentAdapters',
  'ZeusContentRuntime',
  'ZeusOllamaMeta',
  'ZeusRedactor',
  'ZeusGhostText',
  'ZeusCopilot',
  'ZeusSafeDOM',
  'ZeusOllamaCommands'
];

function loadScript(relativePath) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInThisContext(code, { filename: fullPath });
}

function clearZeusGlobals() {
  for (const key of ZEUS_GLOBAL_KEYS) {
    try {
      delete globalThis[key];
    } catch (_) {
      globalThis[key] = undefined;
    }
  }
}

module.exports = {
  loadScript,
  clearZeusGlobals
};
