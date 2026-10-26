(function initZeusPrivacy(globalScope) {
  'use strict';

  const STORAGE_KEY_STATS = 'zeus_privacy_stats';

  const CATEGORY_PREFIXES = Object.freeze({
    email: 'EMAIL',
    phone: 'PHONE',
    creditCard: 'CARD',
    ssn: 'SSN',
    ip: 'IP',
    apiKey: 'API_KEY',
    custom: 'SENSITIVE'
  });

  const CATEGORY_PRIORITY = Object.freeze([
    'apiKey',
    'creditCard',
    'ssn',
    'email',
    'ip',
    'phone',
    'custom'
  ]);

  // Regular expressions for detectors
  const REGEX_EMAIL = /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\b/g;

  // Phone numbers: US and international formatted numbers (min 7 digits, max 15 digits)
  const REGEX_PHONE = /(?:\+?\d{1,3}[-.\s]?)?(?:\([0-9]{2,4}\)|[0-9]{2,4})[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}\b/g;

  // Credit cards: Visa, Mastercard, Amex, Discover with optional dashes or spaces
  const REGEX_CREDIT_CARD = /\b(?:4[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{1,4}|5[1-5][0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|3[47][0-9]{2}[-\s]?[0-9]{6}[-\s]?[0-9]{5}|6(?:011|5[0-9]{2})[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4})\b/g;

  // US Social Security Numbers
  const REGEX_SSN = /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g;

  // IPv4 addresses (0-255 bounded)
  const REGEX_IPV4 = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;

  // IPv6 addresses
  const REGEX_IPV6 = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:(?::[0-9a-fA-F]{1,4}){1,7}\b|\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b/g;

  // High-entropy keys, tokens and credentials
  const API_KEY_PATTERNS = [
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, // OpenAI
    /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, // Anthropic
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, // GitHub
    /\bAKIA[0-9A-Z]{16}\b/g, // AWS Access Key
    /\b[rs]k_(?:live|test)_[0-9a-zA-Z]{24,}\b/g, // Stripe
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g, // JWT
    /\bBearer\s+[A-Za-z0-9_\-\.]{20,}\b/gi, // Bearer Token
    /\b(?:api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"]?([A-Za-z0-9_\-~]{16,})['"]?\b/gi // Generic Key Assignment
  ];

  function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isValidPhoneNumber(str) {
    const digitsOnly = str.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
    // Disqualify strings that look like dates (e.g. 2024-10-12)
    if (/^\d{4}[-.]\d{2}[-.]\d{2}$/.test(str)) return false;
    return true;
  }

  function isLuhnValid(cardDigits) {
    const digits = String(cardDigits).replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  function detectCategory(category, text, customPatterns = []) {
    const matches = [];
    if (!text || typeof text !== 'string') return matches;

    switch (category) {
      case 'email': {
        const regex = new RegExp(REGEX_EMAIL.source, 'g');
        let m;
        while ((m = regex.exec(text)) !== null) {
          matches.push({
            category: 'email',
            value: m[0],
            index: m.index,
            length: m[0].length
          });
        }
        break;
      }

      case 'phone': {
        const regex = new RegExp(REGEX_PHONE.source, 'g');
        let m;
        while ((m = regex.exec(text)) !== null) {
          if (isValidPhoneNumber(m[0])) {
            matches.push({
              category: 'phone',
              value: m[0],
              index: m.index,
              length: m[0].length
            });
          }
        }
        break;
      }

      case 'creditCard': {
        const regex = new RegExp(REGEX_CREDIT_CARD.source, 'g');
        let m;
        while ((m = regex.exec(text)) !== null) {
          const digits = m[0].replace(/\D/g, '');
          if (isLuhnValid(digits)) {
            matches.push({
              category: 'creditCard',
              value: m[0],
              index: m.index,
              length: m[0].length
            });
          }
        }
        break;
      }

      case 'ssn': {
        const regex = new RegExp(REGEX_SSN.source, 'g');
        let m;
        while ((m = regex.exec(text)) !== null) {
          matches.push({
            category: 'ssn',
            value: m[0],
            index: m.index,
            length: m[0].length
          });
        }
        break;
      }

      case 'ip': {
        const regex4 = new RegExp(REGEX_IPV4.source, 'g');
        let m;
        while ((m = regex4.exec(text)) !== null) {
          matches.push({
            category: 'ip',
            value: m[0],
            index: m.index,
            length: m[0].length
          });
        }
        const regex6 = new RegExp(REGEX_IPV6.source, 'g');
        while ((m = regex6.exec(text)) !== null) {
          matches.push({
            category: 'ip',
            value: m[0],
            index: m.index,
            length: m[0].length
          });
        }
        break;
      }

      case 'apiKey': {
        for (const pattern of API_KEY_PATTERNS) {
          const regex = new RegExp(pattern.source, pattern.flags);
          let m;
          while ((m = regex.exec(text)) !== null) {
            // If pattern has capture group (generic assignments), capture value
            const val = m[1] ? m[1] : m[0];
            const idx = m[1] ? m.index + m[0].indexOf(m[1]) : m.index;
            matches.push({
              category: 'apiKey',
              value: val,
              index: idx,
              length: val.length
            });
          }
        }
        break;
      }

      case 'custom': {
        if (!Array.isArray(customPatterns) || customPatterns.length === 0) break;
        for (const item of customPatterns) {
          const raw = String(item || '').trim();
          if (!raw) continue;

          try {
            let regex;
            if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
              const lastSlash = raw.lastIndexOf('/');
              const pattern = raw.slice(1, lastSlash);
              const flags = raw.slice(lastSlash + 1) || 'gi';
              regex = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
            } else {
              // Word boundary if alphanumeric only, else literal
              const isWord = /^[a-zA-Z0-9_\-]+$/.test(raw);
              regex = new RegExp(isWord ? `\\b${escapeRegex(raw)}\\b` : escapeRegex(raw), 'gi');
            }

            let m;
            while ((m = regex.exec(text)) !== null) {
              matches.push({
                category: 'custom',
                value: m[0],
                index: m.index,
                length: m[0].length
              });
            }
          } catch (_) {
            // Ignore invalid custom regex
          }
        }
        break;
      }

      default:
        break;
    }

    return matches;
  }

  function collectAllMatches(text, options = {}) {
    const categoriesConfig = options?.categories || {
      email: true,
      phone: true,
      creditCard: true,
      ssn: true,
      ip: true,
      apiKey: true,
      custom: true
    };
    const customPatterns = options?.customPatterns || [];

    const allMatches = [];
    for (const cat of CATEGORY_PRIORITY) {
      if (categoriesConfig[cat] !== false) {
        const matches = detectCategory(cat, text, customPatterns);
        allMatches.push(...matches);
      }
    }

    // Resolve overlaps: prioritize category priority and longer matches
    allMatches.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      const prioA = CATEGORY_PRIORITY.indexOf(a.category);
      const prioB = CATEGORY_PRIORITY.indexOf(b.category);
      if (prioA !== prioB) return prioA - prioB;
      return b.length - a.length;
    });

    const nonOverlapping = [];
    let lastEnd = 0;

    for (const match of allMatches) {
      const matchEnd = match.index + match.length;
      if (match.index >= lastEnd) {
        nonOverlapping.push(match);
        lastEnd = matchEnd;
      }
    }

    return nonOverlapping;
  }

  function scanPromptForPII(text, options = {}) {
    const rawText = String(text || '');
    if (!rawText.trim()) {
      return {
        hasPII: false,
        count: 0,
        detected: [],
        countsByCategory: {}
      };
    }

    const matches = collectAllMatches(rawText, options);
    const countsByCategory = {};
    for (const m of matches) {
      countsByCategory[m.category] = (countsByCategory[m.category] || 0) + 1;
    }

    return {
      hasPII: matches.length > 0,
      count: matches.length,
      detected: matches.map((m) => ({
        category: m.category,
        value: m.value,
        index: m.index,
        length: m.length,
        preview: maskEntityPreview(m.value, m.category)
      })),
      countsByCategory
    };
  }

  function redactPrompt(text, options = {}) {
    const rawText = String(text || '');
    if (!rawText) {
      return {
        redactedText: '',
        tokenMap: {},
        reverseMap: {},
        counts: {},
        totalRedacted: 0,
        categoriesDetected: []
      };
    }

    const matches = collectAllMatches(rawText, options);
    if (matches.length === 0) {
      return {
        redactedText: rawText,
        tokenMap: {},
        reverseMap: {},
        counts: {},
        totalRedacted: 0,
        categoriesDetected: []
      };
    }

    const tokenMap = {};
    const reverseMap = {};
    const categoryCounters = {};
    const counts = {};

    // First assign surrogate tokens consistently to unique values
    for (const match of matches) {
      const { category, value } = match;
      if (!reverseMap[value]) {
        categoryCounters[category] = (categoryCounters[category] || 0) + 1;
        const prefix = CATEGORY_PREFIXES[category] || 'SENSITIVE';
        const token = `[${prefix}_${categoryCounters[category]}]`;
        tokenMap[token] = value;
        reverseMap[value] = token;
      }
      counts[category] = (counts[category] || 0) + 1;
    }

    // Build redacted string from left to right
    let redactedText = '';
    let cursor = 0;

    for (const match of matches) {
      if (match.index > cursor) {
        redactedText += rawText.slice(cursor, match.index);
      }
      const token = reverseMap[match.value];
      redactedText += token;
      cursor = match.index + match.length;
    }

    if (cursor < rawText.length) {
      redactedText += rawText.slice(cursor);
    }

    const categoriesDetected = Object.keys(counts);

    return {
      redactedText,
      tokenMap,
      reverseMap,
      counts,
      totalRedacted: matches.length,
      categoriesDetected
    };
  }

  function restorePrompt(text, tokenMap) {
    const result = restorePromptWithReport(text, tokenMap);
    return result.restoredText;
  }

  function restorePromptWithReport(text, tokenMap) {
    let current = String(text || '');
    if (!tokenMap || typeof tokenMap !== 'object') {
      return {
        restoredText: current,
        restoredCount: 0,
        unmappedTokens: []
      };
    }

    let restoredCount = 0;
    const tokens = Object.keys(tokenMap);
    const unmappedTokens = [];

    // Sort tokens by length descending so longer tokens match first
    tokens.sort((a, b) => b.length - a.length);

    for (const token of tokens) {
      const originalValue = tokenMap[token];
      if (typeof originalValue !== 'string') continue;

      // Match exact token and handle variations like whitespace or lowercase:
      // e.g. [EMAIL_1], [ email_1 ], [EMAIL_1]
      const cleanTokenName = token.replace(/^\[|\]$/g, '');
      const flexibleRegex = new RegExp(`\\[\\s*${escapeRegex(cleanTokenName)}\\s*\\]`, 'gi');

      const matches = current.match(flexibleRegex);
      if (matches && matches.length > 0) {
        restoredCount += matches.length;
        current = current.replace(flexibleRegex, () => originalValue);
      }
    }

    // Detect if any remaining surrogate tokens like [EMAIL_X] were untouched/unmapped
    const remainingSurrogates = current.match(/\[(?:EMAIL|PHONE|CARD|SSN|IP|API_KEY|SENSITIVE)_\d+\]/gi);
    if (remainingSurrogates) {
      for (const rem of remainingSurrogates) {
        if (!unmappedTokens.includes(rem)) {
          unmappedTokens.push(rem);
        }
      }
    }

    return {
      restoredText: current,
      restoredCount,
      unmappedTokens
    };
  }

  function maskEntityPreview(value, category) {
    const str = String(value || '');
    if (!str) return '';

    switch (category) {
      case 'email': {
        const parts = str.split('@');
        if (parts.length === 2) {
          const name = parts[0];
          const domain = parts[1];
          const maskedName = name.length > 2 ? `${name.slice(0, 2)}***` : '***';
          return `${maskedName}@${domain}`;
        }
        return '***@***';
      }

      case 'phone': {
        const digits = str.replace(/\D/g, '');
        if (digits.length >= 4) {
          return `***-***-${digits.slice(-4)}`;
        }
        return '***-***-****';
      }

      case 'creditCard': {
        const digits = str.replace(/\D/g, '');
        if (digits.length >= 4) {
          return `****-****-****-${digits.slice(-4)}`;
        }
        return '****-****-****-****';
      }

      case 'ssn': {
        const digits = str.replace(/\D/g, '');
        if (digits.length >= 4) {
          return `***-**-${digits.slice(-4)}`;
        }
        return '***-**-****';
      }

      case 'ip': {
        if (str.includes('.')) {
          const octets = str.split('.');
          if (octets.length === 4) {
            return `${octets[0]}.${octets[1]}.***.***`;
          }
        }
        return '***.***.***.***';
      }

      case 'apiKey': {
        if (str.length > 8) {
          return `${str.slice(0, 4)}...${str.slice(-4)}`;
        }
        return '***...***';
      }

      case 'custom':
      default:
        return str.length > 3 ? `${str[0]}***${str[str.length - 1]}` : '***';
    }
  }

  function recordRedactionStats(counts = {}) {
    const storageLocal = globalScope?.chrome?.storage?.local;
    if (!storageLocal || typeof storageLocal.get !== 'function' || typeof storageLocal.set !== 'function') {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      storageLocal.get([STORAGE_KEY_STATS], (data) => {
        const stats = data?.[STORAGE_KEY_STATS] || {
          totalRedacted: 0,
          byCategory: {},
          lastRedactedAt: null
        };

        let addedTotal = 0;
        for (const [cat, count] of Object.entries(counts)) {
          const num = Number(count) || 0;
          if (num > 0) {
            stats.byCategory[cat] = (stats.byCategory[cat] || 0) + num;
            addedTotal += num;
          }
        }

        stats.totalRedacted += addedTotal;
        if (addedTotal > 0) {
          stats.lastRedactedAt = Date.now();
        }

        storageLocal.set({ [STORAGE_KEY_STATS]: stats }, () => {
          resolve(stats);
        });
      });
    });
  }

  function getPrivacyStats() {
    const storageLocal = globalScope?.chrome?.storage?.local;
    if (!storageLocal || typeof storageLocal.get !== 'function') {
      return Promise.resolve({ totalRedacted: 0, byCategory: {}, lastRedactedAt: null });
    }

    return new Promise((resolve) => {
      storageLocal.get([STORAGE_KEY_STATS], (data) => {
        resolve(data?.[STORAGE_KEY_STATS] || { totalRedacted: 0, byCategory: {}, lastRedactedAt: null });
      });
    });
  }

  function resetPrivacyStats() {
    const storageLocal = globalScope?.chrome?.storage?.local;
    if (!storageLocal || typeof storageLocal.set !== 'function') {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      storageLocal.set({
        [STORAGE_KEY_STATS]: {
          totalRedacted: 0,
          byCategory: {},
          lastRedactedAt: null
        }
      }, () => resolve(true));
    });
  }

  globalScope.ZeusPrivacy = Object.freeze({
    CATEGORY_PREFIXES,
    CATEGORY_PRIORITY,
    scanPromptForPII,
    redactPrompt,
    restorePrompt,
    restorePromptWithReport,
    maskEntityPreview,
    recordRedactionStats,
    getPrivacyStats,
    resetPrivacyStats,
    isLuhnValid
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
