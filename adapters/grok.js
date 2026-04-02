(function registerGrokAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  function pickBottomMost(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (list.length <= 1) return list;

    let winner = list[0];
    let maxBottom = winner.getBoundingClientRect().bottom;

    for (const element of list) {
      const bottom = element.getBoundingClientRect().bottom;
      if (bottom > maxBottom) {
        maxBottom = bottom;
        winner = element;
      }
    }

    return [winner];
  }

  adapters.push({
    id: 'grok',
    matches(hostname) {
      return hostname.includes('grok.com');
    },
    inputSelectors: [
      'textarea',
      'div[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]'
    ],
    pickInputs: pickBottomMost
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
