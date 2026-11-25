function createEvent() {
  const listeners = [];

  return {
    listeners,
    addListener(fn) {
      listeners.push(fn);
    },
    removeListener(fn) {
      const index = listeners.indexOf(fn);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
    hasListener(fn) {
      return listeners.includes(fn);
    }
  };
}

function copy(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function pickStoreValues(store, keys) {
  if (!keys) {
    return copy(store);
  }

  if (Array.isArray(keys)) {
    const output = {};
    for (const key of keys) {
      output[key] = store[key];
    }
    return output;
  }

  if (typeof keys === 'string') {
    return { [keys]: store[keys] };
  }

  if (keys && typeof keys === 'object') {
    const output = {};
    for (const key of Object.keys(keys)) {
      output[key] = store[key] !== undefined ? store[key] : keys[key];
    }
    return output;
  }

  return copy(store);
}

function createStorageArea(store, areaName, storageOnChanged) {
  return {
    get(keys, callback) {
      const result = pickStoreValues(store, keys);
      if (typeof callback === 'function') {
        callback(result);
        return;
      }
      return Promise.resolve(result);
    },
    set(payload, callback) {
      const changes = {};
      if (payload && typeof payload === 'object') {
        for (const [key, value] of Object.entries(payload)) {
          changes[key] = { oldValue: copy(store[key]), newValue: copy(value) };
        }
      }
      Object.assign(store, payload || {});
      if (storageOnChanged && Object.keys(changes).length > 0) {
        storageOnChanged.listeners.forEach((fn) => {
          try { fn(changes, areaName); } catch (_) {}
        });
      }
      if (typeof callback === 'function') {
        callback();
        return;
      }
      return Promise.resolve();
    },
    remove(keys, callback) {
      const toRemove = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      for (const key of toRemove) {
        if (key in store) {
          changes[key] = { oldValue: copy(store[key]), newValue: undefined };
        }
        delete store[key];
      }
      if (storageOnChanged && Object.keys(changes).length > 0) {
        storageOnChanged.listeners.forEach((fn) => {
          try { fn(changes, areaName); } catch (_) {}
        });
      }
      if (typeof callback === 'function') {
        callback();
        return;
      }
      return Promise.resolve();
    },
    clear(callback) {
      const changes = {};
      for (const key of Object.keys(store)) {
        changes[key] = { oldValue: copy(store[key]), newValue: undefined };
        delete store[key];
      }
      if (storageOnChanged && Object.keys(changes).length > 0) {
        storageOnChanged.listeners.forEach((fn) => {
          try { fn(changes, areaName); } catch (_) {}
        });
      }
      if (typeof callback === 'function') {
        callback();
        return;
      }
      return Promise.resolve();
    }
  };
}

function createChromeMock(options = {}) {
  const syncStore = { ...(options.syncStore || {}) };
  const localStore = { ...(options.localStore || {}) };

  const runtimeOnInstalled = createEvent();
  const runtimeOnMessage = createEvent();
  const runtimeOnConnect = createEvent();
  const contextMenuOnClicked = createEvent();
  const storageOnChanged = createEvent();

  const calls = {
    runtimeSendMessage: [],
    runtimeConnect: [],
    tabsQuery: [],
    tabsSendMessage: [],
    executeScript: [],
    contextMenusCreate: []
  };

  const chrome = {
    runtime: {
      getManifest: () => require('../../manifest.json'),
      id: 'zeus-test-extension',
      lastError: null,
      onInstalled: runtimeOnInstalled,
      onMessage: runtimeOnMessage,
      sendMessage(message, callback) {
        calls.runtimeSendMessage.push({ message });

        const listeners = runtimeOnMessage.listeners.slice();
        if (!listeners.length) {
          if (typeof callback === 'function') callback(undefined);
          return;
        }

        let responded = false;
        const sendResponse = (payload) => {
          responded = true;
          if (typeof callback === 'function') {
            callback(payload);
          }
        };

        for (const listener of listeners) {
          const handled = listener(message, {}, sendResponse);
          if (handled === true) {
            return;
          }
        }

        if (!responded && typeof callback === 'function') {
          callback(undefined);
        }
      },
      onConnect: runtimeOnConnect,
      connect(connectInfo = {}) {
        const name = connectInfo.name || '';
        const clientOnMessage = createEvent();
        const clientOnDisconnect = createEvent();
        const serverOnMessage = createEvent();
        const serverOnDisconnect = createEvent();

        let isDisconnected = false;

        const clientPort = {
          name,
          onMessage: clientOnMessage,
          onDisconnect: clientOnDisconnect,
          postMessage(msg) {
            if (isDisconnected) return;
            const payload = copy(msg);
            queueMicrotask(() => {
              serverOnMessage.listeners.forEach((fn) => fn(payload));
            });
          },
          disconnect() {
            if (isDisconnected) return;
            isDisconnected = true;
            queueMicrotask(() => {
              clientOnDisconnect.listeners.forEach((fn) => fn(clientPort));
              serverOnDisconnect.listeners.forEach((fn) => fn(serverPort));
            });
          }
        };

        const serverPort = {
          name,
          onMessage: serverOnMessage,
          onDisconnect: serverOnDisconnect,
          postMessage(msg) {
            if (isDisconnected) return;
            const payload = copy(msg);
            queueMicrotask(() => {
              clientOnMessage.listeners.forEach((fn) => fn(payload));
            });
          },
          disconnect() {
            if (isDisconnected) return;
            isDisconnected = true;
            queueMicrotask(() => {
              serverOnDisconnect.listeners.forEach((fn) => fn(serverPort));
              clientOnDisconnect.listeners.forEach((fn) => fn(clientPort));
            });
          }
        };

        calls.runtimeConnect.push({ connectInfo, clientPort, serverPort });

        queueMicrotask(() => {
          runtimeOnConnect.listeners.forEach((fn) => fn(serverPort));
        });

        return clientPort;
      }
    },
    storage: {
      sync: createStorageArea(syncStore, 'sync', storageOnChanged),
      local: createStorageArea(localStore, 'local', storageOnChanged),
      onChanged: storageOnChanged
    },
    contextMenus: {
      create(payload) {
        calls.contextMenusCreate.push(payload);
      },
      onClicked: contextMenuOnClicked
    },
    tabs: {
      query(queryInfo, callback) {
        calls.tabsQuery.push(queryInfo);
        callback([{ id: 101 }]);
      },
      sendMessage(tabId, message) {
        calls.tabsSendMessage.push({ tabId, message });
        return Promise.resolve({ ok: true });
      }
    },
    scripting: {
      executeScript(payload) {
        calls.executeScript.push(payload);
        return Promise.resolve([{ result: true }]);
      }
    }
  };

  return {
    chrome,
    calls,
    syncStore,
    localStore,
    stores: {
      sync: syncStore,
      local: localStore
    },
    listeners: {
      runtimeOnInstalled,
      runtimeOnMessage,
      runtimeOnConnect,
      contextMenuOnClicked,
      storageOnChanged
    }
  };
}

module.exports = {
  createChromeMock
};
