(function registerChatGptAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  adapters.push({
    id: 'chatgpt',
    matches(hostname) {
      return hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com');
    },
    inputSelectors: [
      'textarea#prompt-textarea',
      'textarea[data-id="root"]',
      'textarea',
      'div[role="textbox"][contenteditable="true"]'
    ]
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
