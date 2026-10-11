/**
 * Minimal Chrome extension API mock for unit and integration tests.
 *
 * The runtime modules under test use callback-style Chrome APIs
 * (for example `chrome.storage.sync.get(keys, callback)`), so every async
 * method here invokes its callback on a microtask and supports
 * `chrome.runtime.lastError` for failure-path tests.
 */

const DEEP_CLONE_FALLBACK = (value) => JSON.parse(JSON.stringify(value));

function clone(value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch (_) {
      // Fall through to JSON cloning for non-cloneable values.
    }
  }

  try {
    return DEEP_CLONE_FALLBACK(value);
  } catch (_) {
    return value;
  }
}

function createStorageArea(initialData) {
  const data = new Map();

  if (initialData && typeof initialData === 'object') {
    for (const [key, value] of Object.entries(initialData)) {
      data.set(key, clone(value));
    }
  }

  function applyGet(defaults, keys) {
    const result = {};

    if (keys === undefined || keys === null) {
      for (const [key, value] of data.entries()) {
        result[key] = clone(value);
      }
      return result;
    }

    if (typeof keys === 'string') {
      if (data.has(keys)) {
        result[keys] = clone(data.get(keys));
      }
      return result;
    }

    if (Array.isArray(keys)) {
      for (const key of keys) {
        if (data.has(key)) {
          result[key] = clone(data.get(key));
        }
      }
      return result;
    }

    if (typeof keys === 'object') {
      for (const [key, fallback] of Object.entries(keys)) {
        result[key] = data.has(key) ? clone(data.get(key)) : clone(fallback);
      }
      return result;
    }

    return result;
  }

  function normalizeSetArgs(keysOrObject, maybeValue) {
    if (typeof keysOrObject === 'string') {
      return [[keysOrObject, maybeValue]];
    }

    if (keysOrObject && typeof keysOrObject === 'object') {
      return Object.entries(keysOrObject);
    }

    return [];
  }

  return {
    /** Raw snapshot of currently stored values, for assertions. */
    __data: data,

    /** Seed values without going through set(), for test setup. */
    __seed(values) {
      for (const [key, value] of Object.entries(values || {})) {
        data.set(key, clone(value));
      }
    },

    get(keys, callback) {
      const cb = typeof keys === 'function' ? keys : callback;
      const query = typeof keys === 'function' ? undefined : keys;
      queueMicrotask(() => {
        if (typeof cb === 'function') {
          cb(applyGet(undefined, query));
        }
      });
    },

    set(keysOrObject, maybeValue, callback) {
      const cb = typeof maybeValue === 'function' ? maybeValue : callback;

      for (const [key, value] of normalizeSetArgs(keysOrObject, maybeValue)) {
        if (value === undefined) {
          data.delete(key);
        } else {
          data.set(key, clone(value));
        }
      }

      queueMicrotask(() => {
        if (typeof cb === 'function') {
          cb();
        }
      });
    },

    remove(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        data.delete(key);
      }

      queueMicrotask(() => {
        if (typeof callback === 'function') {
          callback();
        }
      });
    },

    clear(callback) {
      data.clear();
      queueMicrotask(() => {
        if (typeof callback === 'function') {
          callback();
        }
      });
    }
  };
}

function createEvent() {
  const listeners = [];

  return {
    listeners,
    addListener(listener) {
      if (typeof listener === 'function' && !listeners.includes(listener)) {
        listeners.push(listener);
      }
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
    hasListener(listener) {
      return listeners.includes(listener);
    },
    hasListeners() {
      return listeners.length > 0;
    },
    clear() {
      listeners.length = 0;
    }
  };
}

function createChromeMock(options) {
  const settings = options || {};
  const sync = createStorageArea(settings.sync);
  const local = createStorageArea(settings.local);
  const session = createStorageArea(settings.session);

  const runtime = {
    lastError: null,
    id: 'zeus-test-extension-id',
    getURL: (relativePath) => `chrome-extension://zeus-test-extension-id/${String(relativePath || '').replace(/^\/+/, '')}`,
    onMessage: createEvent(),
    onConnect: createEvent(),
    onInstalled: createEvent(),
    sendMessage: (_message, callback) => {
      queueCallback(callback, undefined);
    },
    connect: () => createPort()
  };

  // Chrome clears runtime.lastError once the failing callback has run, so the
  // simulated error must not leak into later assertions.
  function queueCallback(callback, ...args) {
    queueMicrotask(() => {
      if (typeof callback === 'function') {
        try {
          callback(...args);
        } finally {
          runtime.lastError = null;
        }
      }
    });
  }

  const chrome = {
    runtime,
    storage: {
      sync,
      local,
      session,
      onChanged: createEvent()
    },
    tabs: {
      query: (_queryInfo, callback) => {
        queueCallback(callback, []);
      },
      sendMessage: (_tabId, _message, callback) => {
        queueCallback(callback, undefined);
        return Promise.resolve();
      }
    },
    scripting: {
      executeScript: () => Promise.resolve([])
    },
    contextMenus: {
      create: () => 'zeus-enhance-prompt',
      onClicked: createEvent()
    },
    commands: {
      onCommand: createEvent()
    },
    sidePanel: {
      open: () => Promise.resolve(),
      close: () => Promise.resolve()
    },
    windows: {
      getLastFocused: (callback) => {
        queueCallback(callback, { id: 1 });
      }
    }
  };

  return {
    chrome,
    sync,
    local,
    /** Simulate a Chrome runtime error for the next callback-based call. */
    setLastError(message) {
      runtime.lastError = message ? { message: String(message) } : null;
    }
  };
}

/**
 * Minimal chrome.runtime.Port stand-in, mirroring the long-lived connection
 * contract used by the copilot streaming path.
 */
function createPort(name) {
  const onMessage = createEvent();
  const onDisconnect = createEvent();
  const posted = [];

  return {
    name: name || 'zeus-test-port',
    posted,
    onMessage,
    onDisconnect,
    postMessage(message) {
      posted.push(message);
    },
    disconnect() {
      onDisconnect.listeners.slice().forEach((listener) => listener());
    },
    /** Deliver a message to this port's listeners. */
    emit(message) {
      onMessage.listeners.slice().forEach((listener) => listener(message));
    }
  };
}

module.exports = { createChromeMock };
