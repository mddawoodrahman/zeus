(function initZeusTransforms(globalScope) {
  const TRANSFORMS_STORAGE_KEY = 'zeus_transforms';
  const LEGACY_TEMPLATES_STORAGE_KEY = 'zeus_templates';

  // chrome.storage.sync allows 8KB per item and 100KB total. Keep a margin so a
  // save that would silently fail is reported to the user instead.
  const MAX_SYNC_PAYLOAD_BYTES = 90 * 1024;
  const MAX_NAME_LENGTH = 60;
  const MAX_DESCRIPTION_LENGTH = 160;
  const MAX_INSTRUCTION_LENGTH = 4000;
  const MAX_TEMPLATE_LENGTH = 8000;

  const DEFAULT_TRANSFORMS = Object.freeze([
    Object.freeze({
      id: 'builtin-polish',
      name: 'Polish',
      description: 'Improve clarity and conciseness',
      instruction: [
        'Rewrite the prompt so it is noticeably clearer and more concise while keeping the',
        "author's intent, meaning, and level of detail intact.",
        '',
        'RULES:',
        '   - Remove filler, hedging, and duplicated ideas.',
        '   - Replace vague words with precise ones.',
        '   - Keep the prompt roughly the same length or shorter.',
        '   - Do NOT introduce new requirements, sections, or roles that were not implied.',
        '   - Keep the original tone and any domain terminology exactly as written.'
      ].join('\n'),
      template: '',
      variables: [],
      shortcut: 'Ctrl+Shift+1',
      enabled: true,
      builtin: true
    }),
    Object.freeze({
      id: 'builtin-prompt-engineer',
      name: 'Prompt Engineer',
      description: 'Full structured rewrite with role and output spec',
      instruction: [
        'Rewrite the prompt into a maximally precise, structured, and actionable instruction',
        'set that extracts peak performance from a large language model.',
        '',
        'REQUIREMENTS:',
        '   - Identify the true underlying goal, not just the surface request.',
        '   - Assign a single, highly specific expert role aligned with the task domain.',
        '   - Divide the prompt into labeled, logically ordered sections.',
        '   - Define the exact deliverable format and any length, depth, or audience limits.'
      ].join('\n'),
      template: '',
      variables: [],
      shortcut: 'Ctrl+Shift+2',
      enabled: true,
      builtin: true
    })
  ]);

  function sanitizeString(value) {
    return String(value == null ? '' : value).trim();
  }

  function createDefaultTransforms() {
    return DEFAULT_TRANSFORMS.map((transform) => ({
      ...transform,
      variables: transform.variables.slice()
    }));
  }

  function createTransformId(name) {
    const slug = sanitizeString(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    const suffix = Math.random().toString(36).slice(2, 8);
    return slug ? `custom-${slug}-${suffix}` : `custom-${suffix}`;
  }

  function extractTemplateVariables(template) {
    const variables = [];
    const pattern = /\{\{\s*([\w]+)\s*\}\}/g;
    let match = pattern.exec(String(template || ''));

    while (match) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
      match = pattern.exec(String(template || ''));
    }

    return variables;
  }

  function normalizeVariables(value, template) {
    const derived = extractTemplateVariables(template);
    if (derived.length > 0) {
      return derived;
    }

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => sanitizeString(item))
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index);
  }

  /**
   * Coerces one stored record into a valid transform, or returns null when the
   * record is too malformed to keep. Shortcut validity is enforced separately by
   * ZeusShortcuts so this module stays free of key-parsing concerns.
   */
  function normalizeTransform(record, fallbackShortcut) {
    if (!record || typeof record !== 'object') {
      return null;
    }

    const name = sanitizeString(record.name).slice(0, MAX_NAME_LENGTH);
    if (!name) {
      return null;
    }

    const template = sanitizeString(record.template).slice(0, MAX_TEMPLATE_LENGTH);
    const rawInstruction = record.instruction !== undefined ? record.instruction : record.systemInstruction;
    const instruction = sanitizeString(rawInstruction).slice(0, MAX_INSTRUCTION_LENGTH);

    // A transform must be able to do something: either rewrite via instruction or
    // inject text via template.
    if (!template && !instruction) {
      return null;
    }

    const id = sanitizeString(record.id) || createTransformId(name);

    return {
      id,
      name,
      description: sanitizeString(record.description).slice(0, MAX_DESCRIPTION_LENGTH),
      instruction,
      template,
      variables: normalizeVariables(record.variables, template),
      shortcut: sanitizeString(record.shortcut) || sanitizeString(fallbackShortcut),
      enabled: record.enabled === undefined ? true : Boolean(record.enabled),
      builtin: Boolean(record.builtin)
    };
  }

  /**
   * Normalizes a whole collection, preserving built-in defaults when the stored
   * record does not override them and guaranteeing unique ids and shortcuts.
   */
  function normalizeTransforms(value) {
    const source = Array.isArray(value) ? value : [];
    const normalized = [];

    for (const record of source) {
      const transform = normalizeTransform(record);
      if (!transform) {
        continue;
      }

      if (normalized.some((item) => item.id === transform.id)) {
        continue;
      }

      normalized.push(transform);
    }

    return dedupeShortcuts(normalized);
  }

  // Shortcuts must be unique per transform; the first one wins and the rest are
  // unbound so a stale duplicate can never fire the wrong transform.
  function dedupeShortcuts(transforms) {
    const seen = new Set();

    return transforms.map((transform) => {
      if (!transform.shortcut) {
        return transform;
      }

      const key = String(transform.shortcut).toLowerCase();
      if (seen.has(key)) {
        return { ...transform, shortcut: '' };
      }

      seen.add(key);
      return transform;
    });
  }

  function isLegacyTemplateRecord(record) {
    return Boolean(record) &&
      typeof record === 'object' &&
      typeof record.name === 'string' &&
      typeof record.template === 'string' &&
      !sanitizeString(record.instruction);
  }

  function migrateLegacyTemplates(templates) {
    if (!Array.isArray(templates) || templates.length === 0) {
      return [];
    }

    return normalizeTransforms(templates.filter(isLegacyTemplateRecord).map((template) => ({
      id: createTransformId(template.name),
      name: template.name,
      description: 'Imported template',
      instruction: '',
      template: template.template,
      variables: template.variables,
      shortcut: '',
      enabled: true,
      builtin: false
    })));
  }

  function getStorageSync() {
    try {
      const storageSync = globalScope?.chrome?.storage?.sync;
      if (storageSync && typeof storageSync.get === 'function' && typeof storageSync.set === 'function') {
        return storageSync;
      }
    } catch (_) {
      // Fall through to the unavailable case.
    }

    return null;
  }

  function readStorage(keys) {
    return new Promise((resolve, reject) => {
      const storageSync = getStorageSync();
      if (!storageSync) {
        resolve({});
        return;
      }

      storageSync.get(keys, (payload) => {
        if (globalScope?.chrome?.runtime?.lastError) {
          reject(new Error(globalScope.chrome.runtime.lastError.message || 'Failed to read transforms.'));
          return;
        }

        resolve(payload || {});
      });
    });
  }

  /**
   * Loads transforms, seeds the built-in defaults on first use, and imports any
   * legacy zeus_templates entries once. The legacy key is deliberately left in
   * place so rolling back to the previous version does not lose data.
   */
  async function loadTransforms() {
    const payload = await readStorage([TRANSFORMS_STORAGE_KEY, LEGACY_TEMPLATES_STORAGE_KEY]);
    const stored = payload?.[TRANSFORMS_STORAGE_KEY];

    if (Array.isArray(stored)) {
      return dedupeShortcuts(normalizeTransforms(stored));
    }

    const migrated = migrateLegacyTemplates(payload?.[LEGACY_TEMPLATES_STORAGE_KEY]);
    const seeded = createDefaultTransforms().concat(migrated);

    if (seeded.length > 0) {
      await saveTransforms(seeded).catch(() => undefined);
    }

    return seeded;
  }

  function serializeSizeBytes(transforms) {
    const json = JSON.stringify(transforms);
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(json).length;
    }

    return json.length;
  }

  async function saveTransforms(transforms) {
    const normalized = dedupeShortcuts(normalizeTransforms(transforms));
    const size = serializeSizeBytes(normalized);

    if (size > MAX_SYNC_PAYLOAD_BYTES) {
      throw new Error(
        `Transforms are too large to sync (${Math.round(size / 1024)}KB of ` +
        `${Math.round(MAX_SYNC_PAYLOAD_BYTES / 1024)}KB allowed). Shorten or remove a transform.`
      );
    }

    const storageSync = getStorageSync();
    if (!storageSync) {
      throw new Error('Chrome sync storage is unavailable.');
    }

    await new Promise((resolve, reject) => {
      storageSync.set({ [TRANSFORMS_STORAGE_KEY]: normalized }, () => {
        if (globalScope?.chrome?.runtime?.lastError) {
          reject(new Error(globalScope.chrome.runtime.lastError.message || 'Failed to save transforms.'));
          return;
        }

        resolve();
      });
    });

    return normalized;
  }

  function getTransformById(transforms, id) {
    const wanted = sanitizeString(id);
    if (!wanted || !Array.isArray(transforms)) {
      return null;
    }

    return transforms.find((transform) => transform && transform.id === wanted) || null;
  }

  function getEnabledTransforms(transforms) {
    return (Array.isArray(transforms) ? transforms : []).filter((transform) => transform && transform.enabled);
  }

  /**
   * Replaces {{var}} placeholders with provided values. Unresolved placeholders are
   * left untouched so a shortcut-triggered transform never injects empty text.
   */
  function applyTemplateValues(template, values) {
    const provided = values && typeof values === 'object' ? values : {};

    return String(template || '').replace(/\{\{\s*([\w]+)\s*\}\}/g, (full, name) => {
      const value = provided[name];
      return value === undefined || value === null ? full : String(value);
    });
  }

  function findUnresolvedVariables(text) {
    return extractTemplateVariables(text);
  }

  globalScope.ZeusTransforms = Object.freeze({
    TRANSFORMS_STORAGE_KEY,
    LEGACY_TEMPLATES_STORAGE_KEY,
    MAX_SYNC_PAYLOAD_BYTES,
    DEFAULT_TRANSFORMS,
    createDefaultTransforms,
    createTransformId,
    normalizeTransform,
    normalizeTransforms,
    dedupeShortcuts,
    extractTemplateVariables,
    migrateLegacyTemplates,
    loadTransforms,
    saveTransforms,
    getTransformById,
    getEnabledTransforms,
    applyTemplateValues,
    findUnresolvedVariables
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
