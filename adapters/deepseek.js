(function registerDeepSeekAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  adapters.push({
    id: 'deepseek',
    matches(hostname) {
      return hostname.includes('chat.deepseek.com');
    },
    inputSelectors: [
      'textarea',
      'div[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]'
    ]
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
