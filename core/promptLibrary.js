(function initZeusPromptLibrary(globalScope) {
  const STORAGE_KEY = 'zeus_prompt_library';
  const MAX_TITLE_LENGTH = 80;
  const MAX_DESC_LENGTH = 240;
  const MAX_CONTENT_LENGTH = 16000;
  const MAX_TAGS_COUNT = 10;

  const DEFAULT_STARTER_PROMPTS = Object.freeze([
    Object.freeze({
      id: 'builtin-code-review',
      title: 'Military-Grade Code Review',
      description: 'Rigorous multi-axis analysis of security, edge-cases, and architecture.',
      category: 'Engineering',
      tags: ['code-review', 'security', 'quality'],
      activeVersionId: 'v1',
      createdAt: 1712900000000,
      updatedAt: 1712900000000,
      builtin: true,
      versions: [
        Object.freeze({
          versionId: 'v1',
          versionNumber: 1,
          content: [
            'Conduct a rigorous code review of the following {{language}} implementation: {{code}}.',
            '',
            'Evaluate against four strict criteria:',
            '1. Security: Identify injection vectors, memory hazards, and unvalidated inputs.',
            '2. Correctness: Identify off-by-one errors, race conditions, and uncaught rejections.',
            '3. Performance: Assess computational complexity and allocation hotspots.',
            '4. Ergonomics: Recommend cleaner, idiomatic refactors with code examples.'
          ].join('\n'),
          variables: ['language', 'code'],
          notes: 'Initial production baseline review template.',
          createdAt: 1712900000000
        })
      ]
    }),
    Object.freeze({
      id: 'builtin-system-spec',
      title: 'System Architecture Specification',
      description: 'Formal architectural blueprint with threat models and scaling boundaries.',
      category: 'Architecture',
      tags: ['architecture', 'system-design', 'rfc'],
      activeVersionId: 'v1',
      createdAt: 1712900000000,
      updatedAt: 1712900000000,
      builtin: true,
      versions: [
        Object.freeze({
          versionId: 'v1',
          versionNumber: 1,
          content: [
            'Author an architectural RFC specification for {{system_name}} targeting {{target_audience}}.',
            '',
            'Structure the specification as follows:',
            '1. PROBLEM CONTEXT & BUSINESS REQUIREMENTS',
            '2. PROPOSED ARCHITECTURE & DATA FLOW',
            '3. RELIABILITY, RECOVERY & FAULT TOLERANCE',
            '4. SCALABILITY LIMITS (target {{qps_target}} QPS)',
            '5. TRADE-OFFS & REJECTED ALTERNATIVES'
          ].join('\n'),
          variables: ['system_name', 'target_audience', 'qps_target'],
          notes: 'Standard architectural RFC structure.',
          createdAt: 1712900000000
        })
      ]
    }),
    Object.freeze({
      id: 'builtin-exec-memo',
      title: 'Executive Decision Memo',
      description: 'Concise executive summary with bottom-line recommendation and risks.',
      category: 'Leadership',
      tags: ['executive', 'memo', 'strategy'],
      activeVersionId: 'v1',
      createdAt: 1712900000000,
      updatedAt: 1712900000000,
      builtin: true,
      versions: [
        Object.freeze({
          versionId: 'v1',
          versionNumber: 1,
          content: [
            'Prepare a one-page executive memo for leadership regarding: {{topic}}.',
            '',
            'Format rules:',
            '- BLUF (Bottom Line Up Front) in 2 sentences.',
            '- Strategic rationale and key financial or operational metrics.',
            '- Three critical risks and corresponding mitigation strategies.',
            '- Clear decision ask with defined timeline and owner.'
          ].join('\n'),
          variables: ['topic'],
          notes: 'Executive brevity format.',
          createdAt: 1712900000000
        })
      ]
    })
  ]);

  function sanitizeString(value) {
    return String(value == null ? '' : value).trim();
  }

  function extractVariables(content) {
    const variables = [];
    const pattern = /\{\{\s*([\w]+)\s*\}\}/g;
    let match = pattern.exec(String(content || ''));
    while (match) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
      match = pattern.exec(String(content || ''));
    }
    return variables;
  }

  function createId(prefix = 'prompt') {
    const rand = Math.random().toString(36).slice(2, 9);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  function createPrompt(data = {}) {
    const title = sanitizeString(data.title).slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      throw new Error('Prompt title is required.');
    }

    const content = sanitizeString(data.content).slice(0, MAX_CONTENT_LENGTH);
    if (!content) {
      throw new Error('Prompt content cannot be empty.');
    }

    const description = sanitizeString(data.description).slice(0, MAX_DESC_LENGTH);
    const category = sanitizeString(data.category) || 'General';
    const tags = Array.isArray(data.tags)
      ? data.tags.map((t) => sanitizeString(t).toLowerCase()).filter(Boolean).slice(0, MAX_TAGS_COUNT)
      : [];

    const now = Date.now();
    const versionId = 'v1';
    const variables = extractVariables(content);

    const initialVersion = {
      versionId,
      versionNumber: 1,
      content,
      variables,
      notes: sanitizeString(data.notes) || 'Initial version',
      createdAt: now
    };

    return {
      id: sanitizeString(data.id) || createId('prompt'),
      title,
      description,
      category,
      tags,
      activeVersionId: versionId,
      createdAt: now,
      updatedAt: now,
      builtin: Boolean(data.builtin),
      versions: [initialVersion]
    };
  }

  function addVersion(prompt, versionData = {}) {
    if (!prompt || !Array.isArray(prompt.versions)) {
      throw new Error('Invalid prompt object.');
    }

    const content = sanitizeString(versionData.content).slice(0, MAX_CONTENT_LENGTH);
    if (!content) {
      throw new Error('Version content cannot be empty.');
    }

    const highestNumber = prompt.versions.reduce((max, v) => Math.max(max, v.versionNumber || 0), 0);
    const nextNumber = highestNumber + 1;
    const versionId = `v${nextNumber}`;
    const now = Date.now();

    const newVersion = {
      versionId,
      versionNumber: nextNumber,
      content,
      variables: extractVariables(content),
      notes: sanitizeString(versionData.notes) || `Revision v${nextNumber}`,
      createdAt: now
    };

    const updatedVersions = [...prompt.versions, newVersion];

    return {
      ...prompt,
      activeVersionId: versionId,
      updatedAt: now,
      versions: updatedVersions
    };
  }

  function revertVersion(prompt, targetVersionId) {
    if (!prompt || !Array.isArray(prompt.versions)) {
      throw new Error('Invalid prompt object.');
    }

    const target = prompt.versions.find((v) => v.versionId === targetVersionId);
    if (!target) {
      throw new Error(`Version '${targetVersionId}' not found.`);
    }

    return {
      ...prompt,
      activeVersionId: target.versionId,
      updatedAt: Date.now()
    };
  }

  function getActiveVersion(prompt) {
    if (!prompt || !Array.isArray(prompt.versions) || prompt.versions.length === 0) {
      return null;
    }
    const found = prompt.versions.find((v) => v.versionId === prompt.activeVersionId);
    return found || prompt.versions[prompt.versions.length - 1];
  }

  function normalizePrompt(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const title = sanitizeString(raw.title).slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      return null;
    }

    const rawVersions = Array.isArray(raw.versions) ? raw.versions : [];
    const validVersions = [];

    for (let i = 0; i < rawVersions.length; i++) {
      const v = rawVersions[i];
      if (!v || typeof v !== 'object') continue;
      const content = sanitizeString(v.content).slice(0, MAX_CONTENT_LENGTH);
      if (!content) continue;

      const versionNumber = Number.isInteger(v.versionNumber) ? v.versionNumber : i + 1;
      const versionId = sanitizeString(v.versionId) || `v${versionNumber}`;
      validVersions.push({
        versionId,
        versionNumber,
        content,
        variables: extractVariables(content),
        notes: sanitizeString(v.notes) || `Version ${versionNumber}`,
        createdAt: Number(v.createdAt) || Date.now()
      });
    }

    // If no versions exist but raw.content does, generate v1
    if (validVersions.length === 0) {
      const fallbackContent = sanitizeString(raw.content || raw.template).slice(0, MAX_CONTENT_LENGTH);
      if (!fallbackContent) {
        return null;
      }
      validVersions.push({
        versionId: 'v1',
        versionNumber: 1,
        content: fallbackContent,
        variables: extractVariables(fallbackContent),
        notes: 'Migrated version',
        createdAt: Number(raw.createdAt) || Date.now()
      });
    }

    validVersions.sort((a, b) => a.versionNumber - b.versionNumber);

    let activeVersionId = sanitizeString(raw.activeVersionId);
    if (!validVersions.some((v) => v.versionId === activeVersionId)) {
      activeVersionId = validVersions[validVersions.length - 1].versionId;
    }

    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((t) => sanitizeString(t).toLowerCase()).filter(Boolean).slice(0, MAX_TAGS_COUNT)
      : [];

    return {
      id: sanitizeString(raw.id) || createId('prompt'),
      title,
      description: sanitizeString(raw.description).slice(0, MAX_DESC_LENGTH),
      category: sanitizeString(raw.category) || 'General',
      tags,
      activeVersionId,
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Date.now(),
      builtin: Boolean(raw.builtin),
      versions: validVersions
    };
  }

  function createDefaultPrompts() {
    return DEFAULT_STARTER_PROMPTS.map((p) => ({
      ...p,
      tags: p.tags.slice(),
      versions: p.versions.map((v) => ({ ...v, variables: v.variables.slice() }))
    }));
  }

  function normalizeLibrary(rawList) {
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return createDefaultPrompts();
    }

    const normalized = [];
    const seenIds = new Set();

    for (const item of rawList) {
      const norm = normalizePrompt(item);
      if (norm && !seenIds.has(norm.id)) {
        seenIds.add(norm.id);
        normalized.push(norm);
      }
    }

    return normalized.length > 0 ? normalized : createDefaultPrompts();
  }

  function searchPrompts(prompts, criteria = {}) {
    if (!Array.isArray(prompts)) return [];
    const query = sanitizeString(criteria.query).toLowerCase();
    const category = sanitizeString(criteria.category).toLowerCase();
    const tag = sanitizeString(criteria.tag).toLowerCase();

    return prompts.filter((prompt) => {
      if (category && prompt.category.toLowerCase() !== category) {
        return false;
      }
      if (tag && !prompt.tags.some((t) => t.toLowerCase() === tag)) {
        return false;
      }
      if (query) {
        const matchesTitle = prompt.title.toLowerCase().includes(query);
        const matchesDesc = prompt.description.toLowerCase().includes(query);
        const activeVer = getActiveVersion(prompt);
        const matchesContent = activeVer ? activeVer.content.toLowerCase().includes(query) : false;
        const matchesTag = prompt.tags.some((t) => t.toLowerCase().includes(query));
        return matchesTitle || matchesDesc || matchesContent || matchesTag;
      }
      return true;
    });
  }

  function computeVersionDiff(oldText, newText) {
    const oldLines = String(oldText || '').split('\n');
    const newLines = String(newText || '').split('\n');
    const diff = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const o = oldLines[i];
      const n = newLines[i];
      if (o === undefined) {
        diff.push({ type: 'added', line: n, lineNum: i + 1 });
      } else if (n === undefined) {
        diff.push({ type: 'removed', line: o, lineNum: i + 1 });
      } else if (o !== n) {
        diff.push({ type: 'changed', oldLine: o, newLine: n, lineNum: i + 1 });
      } else {
        diff.push({ type: 'unchanged', line: o, lineNum: i + 1 });
      }
    }

    return diff;
  }

  function loadLibrary() {
    return new Promise((resolve) => {
      const storage = globalScope.chrome?.storage?.sync || globalScope.chrome?.storage?.local;
      if (!storage) {
        resolve(createDefaultPrompts());
        return;
      }

      storage.get([STORAGE_KEY], (data) => {
        if (globalScope.chrome?.runtime?.lastError) {
          resolve(createDefaultPrompts());
          return;
        }
        resolve(normalizeLibrary(data?.[STORAGE_KEY]));
      });
    });
  }

  function saveLibrary(prompts) {
    return new Promise((resolve, reject) => {
      const normalized = normalizeLibrary(prompts);
      const storage = globalScope.chrome?.storage?.sync || globalScope.chrome?.storage?.local;
      if (!storage) {
        resolve(normalized);
        return;
      }

      storage.set({ [STORAGE_KEY]: normalized }, () => {
        if (globalScope.chrome?.runtime?.lastError) {
          reject(new Error(globalScope.chrome.runtime.lastError.message || 'Failed to save prompt library.'));
          return;
        }
        resolve(normalized);
      });
    });
  }

  globalScope.ZeusPromptLibrary = Object.freeze({
    STORAGE_KEY,
    DEFAULT_STARTER_PROMPTS,
    createPrompt,
    addVersion,
    revertVersion,
    getActiveVersion,
    normalizePrompt,
    normalizeLibrary,
    createDefaultPrompts,
    searchPrompts,
    computeVersionDiff,
    extractVariables,
    loadLibrary,
    saveLibrary
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
