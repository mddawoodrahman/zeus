(function (scope) {
  if (scope.ZeusContentRuntime) {
    scope.ZeusContentRuntime.refresh();
    return;
  }
  const sites = scope.ZeusContentAdapters || [];
  const site = sites.find((a) => a.matches(location.hostname));
  if (!site || location.protocol !== 'https:') return;

  const bridge = scope.ZeusEditorBridge;
  const ui = scope.ZeusInjector.create(enhance);
  const events = new AbortController();
  let editor = null,
    generation = 0,
    settings = null,
    settingsRequest = null,
    request = null,
    observer,
    contextTarget;
  let started = false,
    suspended = false;
  function bind(next) {
    if (editor !== next) {
      generation++;
      request = null;
      scope.ZeusCopilot?.destroy();
      editor = next;
    }
    ui.bind(editor, site);
    if (editor && settings?.copilotEnabled) scope.ZeusCopilot?.init(editor, settings, ui.overlays);
  }
  function refresh() {
    if (!started || suspended || events.signal.aborted) return;
    bind(site.getActiveEditor(site.findEditors(), editor));
  }
  function invalidate() {
    generation++;
    request = null;
    contextTarget = undefined;
    bind(null);
  }
  function same(el, epoch, url) {
    return (
      !suspended &&
      !events.signal.aborted &&
      editor === el &&
      generation === epoch &&
      location.href === url &&
      site.isEditorAvailable(el)
    );
  }
  function loadSettings() {
    if (!settingsRequest) {
      settingsRequest = scope.ZeusPromptClient.dispatchMessage({ action: 'getSettings' }, 5000)
        .then((response) => {
          if (!settings) settings = response?.settings || null;
          if (!settings) throw new Error('Zeus settings unavailable.');
          refresh();
        })
        .finally(() => {
          settingsRequest = null;
        });
    }
    return settingsRequest;
  }
  async function enhance(el) {
    if (!el || editor !== el || !site.isEditorAvailable(el) || bridge.isComposing(el)) return 'unavailable';
    if (request) return 'busy';
    const original = site.readText(el);
    const revision = bridge.version(el),
      epoch = generation,
      url = location.href;
    const current = () => same(el, epoch, url);
    const operation = {};
    request = operation;
    ui.reset();
    try {
      if (!original.trim()) throw new Error('Enter a prompt first.');
      ui.state('processing', 'Enhancing prompt…');
      if (!settings) {
        await loadSettings();
        if (!current()) return 'stale';
        if (revision !== bridge.version(el) || site.readText(el) !== original) {
          ui.state('idle', 'Your draft changed. Activate Zeus to enhance the current text.', 3000);
          return 'stale';
        }
      }
      const provider = settings.provider;
      if (!['auto', 'ollama'].includes(provider) && settings.hasApiKey?.[provider] === false) {
        throw new Error('Add an API key for the selected provider in Zeus settings.');
      }
      if (!scope.ZeusRedactor || !scope.ZeusPromptClient)
        throw new Error('Reload the page to reconnect Zeus.');
      const { enhancedText, warnings } = await scope.ZeusPromptClient.enhance(original, {
        redactionEnabled: settings.redactionEnabled,
        customRedactionPatterns: settings.customRedactionPatterns,
        timeoutMs: 20000
      });
      if (!current()) return 'stale';
      const changed =
        bridge.isComposing(el) || revision !== bridge.version(el) || original !== site.readText(el);
      if (changed || !site.getCapabilities(el).canReplace || warnings?.length) {
        const reason = changed
          ? 'Your draft changed.'
          : warnings?.length
            ? 'The provider returned a warning. Check for omitted placeholders before copying.'
            : 'This editor supports preview and copy.';
        ui.state('idle', reason, 0, enhancedText);
        return 'preview';
      }
      const ok = await site.replaceText(el, enhancedText, current).catch(() => false);
      if (!current()) return 'stale';
      if (!ok) {
        ui.state(
          'error',
          'Couldn’t verify insertion. Review the enhanced prompt.',
          0,
          enhancedText,
          site.readText(el) !== original ? original : undefined
        );
        return 'preview';
      }
      ui.state('success', 'Enhanced prompt inserted.', 2300);
      return 'enhanced';
    } catch (err) {
      if (current()) {
        const detail = String(err?.message || '');
        let message = 'Enhancement failed. Check the provider in Zeus settings and retry.';
        if (/^Model '.*?' may not be available for Gemini\./i.test(detail)) {
          message = 'Choose a Gemini model available to your account in Zeus settings.';
        } else if (/timeout|timed out/i.test(detail)) {
          message = 'The provider timed out. Try again.';
        } else if (/key|token|401|403|credential/i.test(detail)) {
          message = 'Check the provider API key in Zeus settings.';
        } else if (/empty|enter a prompt/i.test(detail)) {
          message = 'Enter a prompt first.';
        } else if (/network|fetch|offline/i.test(detail)) {
          message = 'Couldn’t reach the provider. Check your connection and retry.';
        }
        ui.state('error', message, 4500);
      }
      return 'failed';
    } finally {
      if (request === operation) request = null;
    }
  }
  function message(msg, sender, reply) {
    switch (msg?.action || msg?.type) {
      case 'forceInjectButton':
        refresh();
        reply({ status: 'injected' });
        break;
      case 'settingsUpdated':
        settings = msg.settings || null;
        scope.ZeusCopilot?.destroy();
        refresh();
        reply({ status: 'ok' });
        break;
      case 'commands:debugToast':
        ui.state('idle', 'Zeus received the shortcut.', 2500);
        reply({ success: true });
        break;
      case 'sidePanel:getCurrentInput':
        refresh();
        reply(editor ? { value: site.readText(editor), url: location.href, site: site.id } : { value: '' });
        break;
      case 'sidePanel:setInputValue': {
        refresh();
        const el = editor,
          epoch = generation,
          url = location.href;
        if (!el || request) {
          reply({ success: false });
          break;
        }
        const operation = {};
        request = operation;
        site
          .replaceText(el, msg.value, () => same(el, epoch, url))
          .then(
            (success) => reply({ success }),
            () => reply({ success: false })
          )
          .finally(() => {
            if (request === operation) request = null;
          });
        return true;
      }
      case 'contextEnhancePrompt': {
        refresh();
        const target = contextTarget === undefined ? editor : contextTarget?.deref();
        if (!target || !site.isEditorAvailable(target)) {
          reply({ status: 'no-input' });
          break;
        }
        bind(target);
        enhance(target).then((status) => reply({ status }));
        return true;
      }
      default:
        return false;
    }
    return false;
  }
  function destroy() {
    events.abort();
    invalidate();
    observer?.disconnect();
    ui.destroy();
    chrome.runtime.onMessage.removeListener?.(message);
    delete scope.ZeusContentRuntime;
  }
  function init() {
    if (started) return;
    started = true;
    bridge.observe(events.signal);
    const listen = (target, name, fn) =>
      target.addEventListener(name, fn, { capture: true, signal: events.signal });
    listen(document, 'focusin', (e) => {
      if (e.target === ui.host) return;
      const target = e.composedPath()[0];
      if (target.matches?.(scope.ZeusDomUtils.editors) || target.matches?.('input')) refresh();
    });
    listen(document, 'contextmenu', (e) => {
      const el = e.composedPath().find((node) => node.matches?.(scope.ZeusDomUtils.editors));
      contextTarget = el && site.isEditorAvailable(el) ? new WeakRef(el) : null;
    });
    listen(window, 'pagehide', (e) => {
      if (!e.persisted) return destroy();
      suspended = true;
      invalidate();
    });
    listen(window, 'pageshow', () => {
      suspended = false;
      refresh();
    });
    listen(document, 'visibilitychange', () => {
      suspended = document.hidden;
      if (suspended) invalidate();
      else refresh();
    });
    chrome.runtime.onMessage.addListener(message);
    observer = scope.ZeusObserver.create({
      onChange: refresh,
      onLayout: ui.reposition,
      onNavigate() {
        invalidate();
        refresh();
      }
    });
    refresh();
    loadSettings().catch(() => {});
  }
  scope.ZeusContentRuntime = Object.freeze({
    refresh,
    getActiveEditor: () => editor,
    enhanceInput: enhance,
    destroy
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, { once: true, signal: events.signal });
  else init();
})(globalThis);
