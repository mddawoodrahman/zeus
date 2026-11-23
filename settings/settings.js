(function initZeusSettings(globalScope) {
  'use strict';

  let store = globalScope.ZeusSettingsStore;
  if (!store && typeof require !== 'undefined') {
    try {
      const path = require('node:path');
      store = require(path.resolve(process.cwd(), 'settings/settingsStore.js'));
    } catch (_) {
      try {
        store = require('./settingsStore.js');
      } catch (_2) {}
    }
  }

  if (!store && typeof globalScope.initZeusSettingsStore === 'function') {
    globalScope.initZeusSettingsStore(globalScope);
    store = globalScope.ZeusSettingsStore;
  }

  if (store) {
    globalScope.ZeusSettingsStore = store;
    globalScope.ZeusSettings = store;
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = store;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
