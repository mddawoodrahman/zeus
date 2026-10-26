/**
 * ZEUS SHORTCUT DIAGNOSTIC
 *
 * Paste the whole file into the PAGE console (DevTools -> Console) while the
 * prompt box you want to test is focused, then press Enter.
 *
 * It reports one `[ZEUS-DIAG]` line per check and finishes with PASS/FAIL, so the
 * exact failing layer is identifiable without guessing. Nothing is modified and
 * nothing is saved; the synthetic press at the end operates on a detached
 * textarea, never on your real prompt.
 */
(function zeusShortcutDiagnostic() {
  var results = [];

  function record(name, ok, detail) {
    results.push({ name: name, ok: ok, detail: detail });
    try {
      console.log(
        '[ZEUS-DIAG] ' + (ok ? 'PASS' : 'FAIL') + ' | ' + name +
        (detail === undefined || detail === null ? '' : ' | ' + detail)
      );
    } catch (_) {}
  }

  function info(label, value) {
    try {
      console.log('[ZEUS-DIAG] info | ' + label + ' | ' + String(value));
    } catch (_) {}
  }

  // ---- 1. Is the content script alive in this frame at all? ----------------
  var hasShortcuts = typeof window.ZeusShortcuts === 'object' && window.ZeusShortcuts !== null;
  var hasTransforms = typeof window.ZeusTransforms === 'object' && window.ZeusTransforms !== null;
  var hasRuntime = typeof window.ZeusContentRuntime === 'object' && window.ZeusContentRuntime !== null;

  record('ZeusShortcuts loaded', hasShortcuts);
  record('ZeusTransforms loaded', hasTransforms);
  record('ZeusContentRuntime loaded', hasRuntime);
  record(
    'ZeusContentRuntime.destroy present',
    hasRuntime && typeof window.ZeusContentRuntime.destroy === 'function',
    hasRuntime ? Object.keys(window.ZeusContentRuntime).join(',') : 'runtime missing'
  );

  // ---- 2. Does a synthetic press reach our handler? -----------------------
  // NOTE: `document.onkeydown` is NOT a valid probe here. Content scripts use
  // addEventListener, which never appears on the `onkeydown` property, so reading
  // it reports a false negative. Behaviour is the only reliable signal available
  // to a page script, so check both the positive and the negative case.
  var probeField = null;
  var boundFired = false;
  var unboundIgnored = false;
  var focusBeforeProbe = document.activeElement;

  try {
    probeField = document.createElement('textarea');
    probeField.value = 'zeus diagnostic probe';
    probeField.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:60px;';
    document.body.appendChild(probeField);
    probeField.focus();

    // Positive: a bound combo must be claimed (defaultPrevented).
    var boundPress = new KeyboardEvent('keydown', {
      key: '@',
      code: 'Digit2',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    probeField.dispatchEvent(boundPress);
    boundFired = boundPress.defaultPrevented;

    // Negative: an unbound combo must pass straight through.
    var unboundPress = new KeyboardEvent('keydown', {
      key: ')',
      code: 'Digit0',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    probeField.dispatchEvent(unboundPress);
    unboundIgnored = !unboundPress.defaultPrevented;
  } catch (error) {
    info('synthetic press error', error && error.message ? error.message : error);
  } finally {
    if (probeField && probeField.parentNode) {
      probeField.parentNode.removeChild(probeField);
    }
    // Hand focus back so the rest of the diagnostic (and the user) sees the
    // element they had selected, not the throwaway probe.
    try {
      if (focusBeforeProbe && typeof focusBeforeProbe.focus === 'function') {
        focusBeforeProbe.focus();
      }
    } catch (_) {}
  }

  record(
    'handler claims a bound combo (Ctrl+Shift+2)',
    boundFired,
    boundFired
      ? 'defaultPrevented=true - listener is alive and the combo matches'
      : 'no response - listener missing, or Ctrl+Shift+2 is not bound/enabled'
  );
  record(
    'handler ignores an unbound combo (Ctrl+Shift+0)',
    unboundIgnored,
    unboundIgnored ? 'passed through as normal typing' : 'handler over-captured an unbound key'
  );

  info(
    'listener count',
    'not enumerable from a page script. For the real count, run this in this console: ' +
    'getEventListeners(document).keydown'
  );

  // ---- 3. Which element does the handler consider focused? ----------------
  var active = document.activeElement;
  try {
    if (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
  } catch (_) {}

  var tag = active ? String(active.tagName || '') : 'null';
  var editableAttr = active && active.getAttribute ? active.getAttribute('contenteditable') : null;
  var isEditableFlag = Boolean(active && active.isContentEditable);
  var box = null;
  try {
    box = active && active.getBoundingClientRect ? active.getBoundingClientRect() : null;
  } catch (_) {}

  info('activeElement tag', tag);
  info('contenteditable attr', editableAttr);
  info('isContentEditable', isEditableFlag);
  info(
    'activeElement size',
    box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'unknown'
  );

  var focusLooksRight = false;
  if (active) {
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      focusLooksRight = true;
    } else if (isEditableFlag) {
      focusLooksRight = true;
    }
  }

  record('a prompt-like element is focused', focusLooksRight, focusLooksRight ? tag : 'focus is on ' + tag);

  // ---- 4. Would a REAL press be delivered to the page at all? -------------
  var realPressSeen = false;
  var realPressDetail = 'not tested';
  function onRealPress(event) {
    if (event.ctrlKey && event.shiftKey && (event.code === 'Digit2' || event.code === 'Digit1')) {
      realPressSeen = true;
      realPressDetail =
        'key=' + JSON.stringify(event.key) +
        ' code=' + JSON.stringify(event.code) +
        ' target=' + String((event.target && event.target.tagName) || 'null');
    }
  }

  try {
    document.addEventListener('keydown', onRealPress, true);
  } catch (_) {}

  // ---- 5. What does storage say the bindings are? -------------------------
  // Reported asynchronously; the console lines below arrive after the ones above.
  try {
    if (window.chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({ action: 'getTransforms' }, function (response) {
        if (chrome.runtime.lastError) {
          record('background getTransforms', false, chrome.runtime.lastError.message);
          return;
        }

        var list = response && Array.isArray(response.transforms) ? response.transforms : null;
        record('background getTransforms', Boolean(list), list ? list.length + ' transform(s)' : 'no list');

        if (list) {
          var pairs = list.map(function (transform) {
            return String(transform.name) + '=' + JSON.stringify(String(transform.shortcut || '')) +
              (transform.enabled === false ? '(disabled)' : '');
          });
          info('stored bindings', pairs.join(' | '));

          if (hasShortcuts && window.ZeusShortcuts) {
            var firstBound = null;
            for (var index = 0; index < list.length; index += 1) {
              if (list[index] && list[index].shortcut && list[index].enabled !== false) {
                firstBound = list[index];
                break;
              }
            }

            if (firstBound) {
              var parsed = window.ZeusShortcuts.parseCombo(firstBound.shortcut);
              record(
                'stored shortcut parses',
                Boolean(parsed),
                JSON.stringify(firstBound.shortcut) + ' -> ' + JSON.stringify(parsed)
              );
            }
          }
        }
      });
    } else {
      record('background getTransforms', false, 'chrome.runtime unavailable in this context');
    }
  } catch (error) {
    record('background getTransforms', false, String(error && error.message ? error.message : error));
  }

  // ---- Summary ------------------------------------------------------------
  var failed = results.filter(function (entry) {
    return entry.ok === false;
  });

  try {
    console.log(
      '[ZEUS-DIAG] ===== SUMMARY: ' + (results.length - failed.length) + ' pass, ' +
      failed.length + ' fail ====='
    );
    if (failed.length > 0) {
      console.log('[ZEUS-DIAG] failing checks: ' + failed.map(function (e) { return e.name; }).join(' ; '));
    }
    console.log(
      '[ZEUS-DIAG] Now press Ctrl+Shift+2 (caret in the prompt box). ' +
      'If no "[ZEUS-DIAG] REAL PRESS" line appears, the keystroke never reaches the page.'
    );
  } catch (_) {}

  // Surface real presses for ~20s, then detach the probe listener.
  var announce = setInterval(function () {
    if (realPressSeen) {
      clearInterval(announce);
      document.removeEventListener('keydown', onRealPress, true);
      console.log('[ZEUS-DIAG] REAL PRESS REACHED THE PAGE | ' + realPressDetail);
    }
  }, 250);

  setTimeout(function () {
    clearInterval(announce);
    try {
      document.removeEventListener('keydown', onRealPress, true);
    } catch (_) {}
    if (!realPressSeen) {
      console.log('[ZEUS-DIAG] NO REAL PRESS was observed within 20s.');
    }
  }, 20000);

  return 'ZEUS-DIAG complete - see the [ZEUS-DIAG] lines above (and keep the console open 20s for the real-press check).';
})();
