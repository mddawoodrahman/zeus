(function registerClaudeAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  adapters.push({
    id: 'claude',
    matches(hostname) {
      return hostname.includes('claude.ai');
    },
    inputSelectors: [
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea'
    ]
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
