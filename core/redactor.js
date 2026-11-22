(function initZeusRedactor(globalScope) {
  'use strict';

  // Deterministic Regex Patterns in strict precedence order
  const PEM_REGEX = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g;
  const URI_REGEX = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?|amqps?|mssql):\/\/[^\s"'<>]+/gi;
  const JWT_REGEX = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
  const KNOWN_KEY_REGEX = /(?<![a-zA-Z0-9_-])(?:sk-ant-[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z-_]{35}|AKIA[0-9A-Z]{16})(?![a-zA-Z0-9_-])/g;
  const CREDENTIAL_ASSIGNMENT_REGEX = /['"]?(?:api[_-]?key|secret|password|auth_token)['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_\-.~!@#$%^&*+=/]{8,})['"]?/gi;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const IPV4_CANDIDATE_REGEX = /(?<![\w.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?![\w]|\.[a-zA-Z0-9])/g;

  // Ephemeral in-memory warning trackers (never persisted)
  let lastWarnings = [];
  let lastDroppedPlaceholders = [];

  function isExcludedIpv4(ip, matchIndex, fullText) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => isNaN(n) || n < 0 || n > 255)) {
      return true;
    }

    // Exclude 0.0.0.0/8 (RFC 1122 "this network", including 0.0.0.0 and pre-v1 semvers like 0.1.2.3)
    if (octets[0] === 0) {
      return true;
    }

    // Exclude loopback (127.0.0.0/8, including 127.0.0.1 and 127.0.0.53)
    if (octets[0] === 127) {
      return true;
    }

    // Exclude broadcast & netmasks (255.0.0.0/8, including 255.255.255.255, 255.255.255.0, etc.)
    if (octets[0] === 255) {
      return true;
    }

    // Preceded by dot (e.g., .1.2.3.4)
    const charBefore = matchIndex > 0 ? fullText[matchIndex - 1] : '';
    if (charBefore === '.') {
      return true;
    }

    // Followed by dot: check if it's a multi-dot chain (e.g. 1.2.3.4.5) or an in-sentence trailing dot (e.g. "1.2.3.4. must")
    const charAfter = matchIndex + ip.length < fullText.length ? fullText[matchIndex + ip.length] : '';
    if (charAfter === '.') {
      const afterDot = fullText.slice(matchIndex + ip.length + 1);
      // Multi-dot chain: 1.2.3.4.5 or 1.2.3.4.abc
      if (/^[a-zA-Z0-9]/.test(afterDot)) {
        return true;
      }
      // Mid-sentence trailing dot: e.g. "Followed dot 1.2.3.4. must not match"
      if (/^\s+[a-z]/.test(afterDot)) {
        return true;
      }
    }

    // Direct alphanumeric adjacency means it's not a standalone IPv4 address
    if (/[0-9a-zA-Z]/.test(charBefore) || /[0-9a-zA-Z]/.test(charAfter)) {
      return true;
    }

    // Preceded by '@' (e.g. package@1.2.3.4 or docker-image@1.2.3.4)
    if (charBefore === '@') {
      return true;
    }

    // Check for software semver or version prefixes
    // (e.g. "v1.2.3.4", "version 1.2.3.4", "version number 1.2.3.4", "semver: 1.2.3.4", "rev 1.2.3.4", "release-1.2.3.4")
    const prefix = fullText.slice(Math.max(0, matchIndex - 35), matchIndex);
    if (/(?:^|[\s_/-])(?:v|ver|version|release|build|rev|revision|semver|tag)(?:\s+(?:number|no|num|id|#))?[\s.:=-]*$/i.test(prefix)) {
      return true;
    }

    // Check for semver release suffixes or build metadata (e.g. "1.2.3.4-beta", "1.2.3.4-rc1", "1.2.3.4+20240101", "1.2.3.4-canary")
    const suffix = fullText.slice(matchIndex + ip.length, Math.min(fullText.length, matchIndex + ip.length + 30));
    if (/^[-+](?:[a-zA-Z0-9_.-]+)/i.test(suffix)) {
      return true;
    }

    return false;
  }

  function findHighestExistingIndices(text) {
    const existingRegex = /(?:\\?\[){1,2}\s*ZEUS_([A-Z0-9_]+)_(\d+)\s*(?:\\?\]){1,2}/gi;
    const highest = {
      SECRET: 0,
      EMAIL: 0,
      IPV4: 0
    };
    let match;
    while ((match = existingRegex.exec(text)) !== null) {
      const category = (match[1] || '').toUpperCase();
      const index = parseInt(match[2], 10);
      if (!isNaN(index) && index > (highest[category] || 0)) {
        highest[category] = index;
      }
    }
    return highest;
  }

  function scrub(text, options = {}) {
    const rawInput = text == null ? '' : String(text);

    if (!rawInput) {
      return {
        text: '',
        scrubbedText: '',
        secretMap: {},
        map: {},
        hasRedactions: false,
        count: 0,
        categories: {
          secrets: 0,
          emails: 0,
          ipv4s: 0
        }
      };
    }

    // If redaction is explicitly disabled in options / settings
    if (options.redactionEnabled === false) {
      return {
        text: rawInput,
        scrubbedText: rawInput,
        secretMap: {},
        map: {},
        hasRedactions: false,
        count: 0,
        categories: {
          secrets: 0,
          emails: 0,
          ipv4s: 0
        }
      };
    }

    const secretMap = {};
    const valueToPlaceholder = new Map();
    const existingIndices = findHighestExistingIndices(rawInput);
    const counters = {
      SECRET: existingIndices.SECRET,
      EMAIL: existingIndices.EMAIL,
      IPV4: existingIndices.IPV4
    };

    function getOrCreatePlaceholder(category, value) {
      if (valueToPlaceholder.has(value)) {
        return valueToPlaceholder.get(value);
      }
      counters[category] = (counters[category] || 0) + 1;
      const placeholder = `[[ZEUS_${category}_${counters[category]}]]`;
      valueToPlaceholder.set(value, placeholder);
      secretMap[placeholder] = value;
      return placeholder;
    }

    let current = rawInput;

    // Optional custom patterns run first
    const customPatterns = options.customRedactionPatterns || options.customPatterns;
    if (Array.isArray(customPatterns) && customPatterns.length > 0) {
      for (const pattern of customPatterns) {
        try {
          const regex = pattern instanceof RegExp
            ? new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
            : new RegExp(String(pattern), 'g');
          current = current.replace(regex, (match) => {
            if (!match || match.startsWith('[[ZEUS_')) return match;
            return getOrCreatePlaceholder('SECRET', match);
          });
        } catch (_) {
          // Ignore invalid custom regex
        }
      }
    }

    // Tier 1: PEM private keys
    current = current.replace(PEM_REGEX, (match) => {
      if (!match || match.startsWith('[[ZEUS_')) return match;
      return getOrCreatePlaceholder('SECRET', match);
    });

    // Tier 2: Connection URIs / credentials
    current = current.replace(URI_REGEX, (match) => {
      if (!match || match.startsWith('[[ZEUS_')) return match;
      let cleanUri = match;
      let trailingPunct = '';
      while (cleanUri.length > 0 && /[.,;:!?)]/.test(cleanUri[cleanUri.length - 1])) {
        trailingPunct = cleanUri[cleanUri.length - 1] + trailingPunct;
        cleanUri = cleanUri.slice(0, -1);
      }
      if (!cleanUri) return match;
      return getOrCreatePlaceholder('SECRET', cleanUri) + trailingPunct;
    });

    // Tier 3: Bearer & JWT tokens
    current = current.replace(JWT_REGEX, (match) => {
      if (!match || match.startsWith('[[ZEUS_')) return match;
      return getOrCreatePlaceholder('SECRET', match);
    });

    // Tier 4: Known API key prefixes
    current = current.replace(KNOWN_KEY_REGEX, (match) => {
      if (!match || match.startsWith('[[ZEUS_')) return match;
      return getOrCreatePlaceholder('SECRET', match);
    });

    // Tier 5: Key-value credential assignments
    current = current.replace(CREDENTIAL_ASSIGNMENT_REGEX, (fullMatch, secretVal) => {
      if (!secretVal || /(?:^|\\)\[{1,2}\s*ZEUS_/i.test(secretVal)) {
        return fullMatch;
      }
      const assignIdx = fullMatch.search(/[:=]/);
      if (assignIdx === -1) {
        return fullMatch;
      }
      const prefix = fullMatch.slice(0, assignIdx + 1);
      const suffix = fullMatch.slice(assignIdx + 1);

      const trimmedSuffix = suffix.trim();
      const isQuoted = (trimmedSuffix.startsWith('"') && trimmedSuffix.endsWith('"')) ||
                       (trimmedSuffix.startsWith("'") && trimmedSuffix.endsWith("'"));

      let cleanSecret = secretVal;
      let trailingPunct = '';

      if (!isQuoted) {
        while (cleanSecret.length > 0 && /[.,;!?)]/.test(cleanSecret[cleanSecret.length - 1])) {
          trailingPunct = cleanSecret[cleanSecret.length - 1] + trailingPunct;
          cleanSecret = cleanSecret.slice(0, -1);
        }
        if (cleanSecret.length < 8) {
          return fullMatch;
        }
      }

      const placeholder = getOrCreatePlaceholder('SECRET', cleanSecret);
      const replacedSuffix = suffix.replace(cleanSecret + trailingPunct, () => placeholder + trailingPunct);
      return prefix + replacedSuffix;
    });

    // Tier 6: Email addresses
    current = current.replace(EMAIL_REGEX, (match) => {
      if (!match || match.startsWith('[[ZEUS_')) return match;
      return getOrCreatePlaceholder('EMAIL', match);
    });

    // Tier 7: Public IPv4 addresses with context-aware exclusion
    let ipv4Result = '';
    let lastIndex = 0;
    let ipv4Match;
    const ipv4Regex = new RegExp(IPV4_CANDIDATE_REGEX.source, 'g');
    while ((ipv4Match = ipv4Regex.exec(current)) !== null) {
      const matchIp = ipv4Match[0];
      const matchOffset = ipv4Match.index;

      ipv4Result += current.slice(lastIndex, matchOffset);

      if (isExcludedIpv4(matchIp, matchOffset, current)) {
        ipv4Result += matchIp;
      } else {
        const placeholder = getOrCreatePlaceholder('IPV4', matchIp);
        ipv4Result += placeholder;
      }

      lastIndex = matchOffset + matchIp.length;
    }
    ipv4Result += current.slice(lastIndex);
    current = ipv4Result;

    const totalRedactions = Object.keys(secretMap).length;

    return {
      text: current,
      scrubbedText: current,
      secretMap,
      map: secretMap,
      hasRedactions: totalRedactions > 0,
      count: totalRedactions,
      categories: {
        secrets: counters.SECRET - existingIndices.SECRET,
        emails: counters.EMAIL - existingIndices.EMAIL,
        ipv4s: counters.IPV4 - existingIndices.IPV4
      }
    };
  }

  function hydrate(text, secretMap, options = {}) {
    lastWarnings = [];
    lastDroppedPlaceholders = [];

    const rawInput = text == null ? '' : String(text);

    if (!rawInput || !secretMap) {
      if (options?.detailed || options?.returnDetails) {
        return {
          text: rawInput,
          warnings: [],
          droppedPlaceholders: []
        };
      }
      return rawInput;
    }

    let mapObj = secretMap;
    if (mapObj && typeof mapObj === 'object') {
      if (mapObj.secretMap && typeof mapObj.secretMap === 'object') {
        mapObj = mapObj.secretMap;
      } else if (mapObj.map && typeof mapObj.map === 'object') {
        mapObj = mapObj.map;
      }
    }

    const entries = mapObj instanceof Map
      ? Array.from(mapObj.entries())
      : Object.entries(mapObj);

    if (entries.length === 0) {
      if (options?.detailed || options?.returnDetails) {
        return {
          text: rawInput,
          warnings: [],
          droppedPlaceholders: []
        };
      }
      return rawInput;
    }

    // Sort placeholders descending by length to prevent partial-match prefix collisions
    entries.sort((a, b) => b[0].length - a[0].length);

    const droppedPlaceholders = [];
    const warnings = [];
    let current = rawInput;

    for (const [placeholder, originalValue] of entries) {
      if (current.includes(placeholder)) {
        // Fast path: exact literal match (avoids $$, $&, $', $` regex replacement corruption)
        current = current.split(placeholder).join(String(originalValue ?? ''));
      } else {
        // Tolerant fallback: recover placeholders altered by model formatting (single brackets, lowercase, escaped markdown, inner whitespace)
        const tokenName = placeholder.replace(/^\[\[/, '').replace(/\]\]$/, '');
        const escapedTokenName = tokenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tolerantRegex = new RegExp(`(?:\\\\?\\[){1,2}\\s*${escapedTokenName}\\s*(?:\\\\?\\]){1,2}`, 'gi');

        if (tolerantRegex.test(current)) {
          current = current.replace(tolerantRegex, () => String(originalValue ?? ''));
        } else {
          droppedPlaceholders.push(placeholder);
          const warning = `[ZeusRedactor] Warning: Redacted placeholder ${placeholder} was dropped by the model output.`;
          warnings.push(warning);
          console.warn(warning);
          if (typeof options?.onWarning === 'function') {
            try {
              options.onWarning(warning, placeholder);
            } catch (_) {}
          }
        }
      }
    }

    lastWarnings = warnings.slice();
    lastDroppedPlaceholders = droppedPlaceholders.slice();

    if (options?.detailed || options?.returnDetails) {
      return {
        text: current,
        warnings,
        droppedPlaceholders
      };
    }

    return current;
  }

  function hydrateWithDetails(text, secretMap, options = {}) {
    return hydrate(text, secretMap, { ...options, detailed: true });
  }

  function getLastWarnings() {
    return {
      warnings: lastWarnings.slice(),
      droppedPlaceholders: lastDroppedPlaceholders.slice()
    };
  }

  function hasSensitive(text, options = {}) {
    const result = scrub(text, options);
    return result.hasRedactions;
  }

  const ZeusRedactor = Object.freeze({
    scrub,
    hydrate,
    hydrateWithDetails,
    getLastWarnings,
    hasSensitive,
    isExcludedIpv4,
    findHighestExistingIndices,
    PATTERNS: Object.freeze({
      PEM_REGEX,
      URI_REGEX,
      JWT_REGEX,
      KNOWN_KEY_REGEX,
      CREDENTIAL_ASSIGNMENT_REGEX,
      EMAIL_REGEX,
      IPV4_CANDIDATE_REGEX
    })
  });

  globalScope.ZeusRedactor = ZeusRedactor;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusRedactor;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
