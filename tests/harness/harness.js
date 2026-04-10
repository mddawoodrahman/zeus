(function runAdapterHarness(globalScope) {
  const config = globalScope.__ZEUS_HARNESS__ || {};
  const resultList = document.getElementById('results');
  const runButton = document.getElementById('run-checks');

  function pushResult(ok, label, detail) {
    if (!resultList) {
      return;
    }

    const item = document.createElement('li');
    item.className = ok ? 'ok' : 'fail';
    item.textContent = `${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` -> ${detail}` : ''}`;
    resultList.appendChild(item);
  }

  function resetResults() {
    if (resultList) {
      resultList.innerHTML = '';
    }
  }

  function runChecks() {
    resetResults();

    const adapters = Array.isArray(globalScope.ZeusContentAdapters) ? globalScope.ZeusContentAdapters : [];
    const domUtils = globalScope.ZeusDomUtils;
    const adapter = adapters.find((item) => item?.id === config.adapterId);

    pushResult(Boolean(domUtils), 'ZeusDomUtils loaded');
    pushResult(Boolean(adapter), `Adapter '${String(config.adapterId || '')}' loaded`);

    if (!domUtils || !adapter) {
      return;
    }

    pushResult(typeof adapter.getInputElement === 'function', 'getInputElement contract');
    pushResult(typeof adapter.getAnchorContainer === 'function', 'getAnchorContainer contract');
    pushResult(typeof adapter.getPositionStrategy === 'function', 'getPositionStrategy contract');

    const expectedHost = String(config.testHostname || '').trim();
    const hostMatched = typeof adapter.matches === 'function' ? Boolean(adapter.matches(expectedHost)) : false;
    pushResult(hostMatched, 'Adapter host matcher', `hostname=${expectedHost}`);

    const selectors = Array.isArray(adapter.inputSelectors) ? adapter.inputSelectors : domUtils.DEFAULT_INPUT_SELECTORS;
    const candidates = domUtils.findCandidates(selectors, document);
    const eligible = domUtils.filterEligibleInputs(candidates);

    const minEligible = Number(config.minEligible || 1);
    pushResult(eligible.length >= minEligible, 'Eligible input count', `found=${eligible.length} expected>=${minEligible}`);

    if (typeof adapter.getInputElement === 'function') {
      const selected = adapter.getInputElement();
      pushResult(Boolean(selected), 'Adapter selected input');

      if (selected && typeof adapter.getAnchorContainer === 'function') {
        const anchor = adapter.getAnchorContainer(selected);
        pushResult(Boolean(anchor), 'Adapter anchor resolution');
      }

      if (selected && typeof adapter.getPositionStrategy === 'function') {
        const strategy = adapter.getPositionStrategy(selected);
        pushResult(Boolean(strategy && typeof strategy === 'object'), 'Adapter position strategy object');
      }
    }

    if (typeof adapter.pickInputs === 'function') {
      const picked = domUtils.filterEligibleInputs(adapter.pickInputs(eligible));
      const expectedPicked = Number(config.expectedPickedCount || 1);
      pushResult(picked.length === expectedPicked, 'pickInputs contract', `picked=${picked.length} expected=${expectedPicked}`);

      if (config.expectPickedId) {
        const pickedId = String(picked[0]?.id || '');
        pushResult(pickedId === String(config.expectPickedId), 'pickInputs target element', `pickedId=${pickedId}`);
      }
    } else {
      pushResult(true, 'pickInputs contract', 'Adapter does not override pickInputs');
    }
  }

  if (runButton) {
    runButton.addEventListener('click', runChecks);
  }

  runChecks();
})(typeof globalThis !== 'undefined' ? globalThis : this);
