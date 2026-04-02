(function registerGenericAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  adapters.push({
    id: 'generic',
    matches() {
      return true;
    },
    inputSelectors: [
      'textarea',
      'div[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
      'input[type="text"]',
      'input[type="search"]'
    ]
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
