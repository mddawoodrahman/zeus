(function registerQualityScoreModule(globalScope) {
  const STORAGE_KEY = 'zeus_ab_experiments';

  const VAGUE_WORDS = [
    'stuff', 'things', 'good', 'nice', 'do something', 'whatever',
    'some kind of', 'make it work', 'etc', 'so on'
  ];

  const ACTION_VERBS = [
    'analyze', 'generate', 'create', 'review', 'explain', 'write',
    'design', 'refactor', 'compare', 'summarize', 'evaluate', 'optimize',
    'diagnose', 'implement', 'extract', 'format', 'audit', 'debug', 'transform'
  ];

  const FORMAT_KEYWORDS = [
    'json', 'markdown', 'table', 'bullet points', 'step-by-step',
    'csv', 'yaml', 'code', 'diagram', 'schema', 'numbered list', 'xml'
  ];

  const CONSTRAINT_WORDS = [
    'must', 'must not', 'do not', 'never', 'only', 'limit to',
    'ensure', 'strict', 'required', 'avoid', 'do not include', 'forbidden'
  ];

  const ROLE_PATTERNS = [
    /\byou are (?:a|an)\b/i,
    /\bact as (?:a|an)\b/i,
    /\brole:\b/i,
    /\bas an? (?:expert|specialist|engineer|analyst|architect|developer)\b/i,
    /\bexpert in\b/i,
    /\bsenior\b/i,
    /\bprincipal\b/i
  ];

  const FILLER_PHRASES = [
    'in order to',
    'as a matter of fact',
    'can you please',
    'i would like you to',
    'could you kindly',
    'i was wondering if you could',
    'if you don\'t mind',
    'please feel free to'
  ];

  function sanitizeString(value) {
    return String(value == null ? '' : value).trim();
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, Math.round(val)));
  }

  function scoreClarity(text) {
    if (!text) return 0;
    let score = 4;
    const lower = text.toLowerCase();

    // Prominent action verb check
    const hasActionVerb = ACTION_VERBS.some((verb) => lower.includes(verb));
    if (hasActionVerb) score += 6;

    // Output format specified
    const hasFormat = FORMAT_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasFormat) score += 6;

    // Vague words penalty
    let vagueCount = 0;
    for (const vague of VAGUE_WORDS) {
      if (lower.includes(vague)) vagueCount += 1;
    }
    if (vagueCount === 0 && text.length > 20) {
      score += 4;
    } else {
      score -= vagueCount * 2;
    }

    return clamp(score, 0, 20);
  }

  function scoreStructure(text) {
    if (!text) return 0;
    let score = 2;
    const lower = text.toLowerCase();

    // Delimiters, headers, or bullet lists
    const hasBullets = /(?:^|\n)\s*[-*•\d+.]\s+/m.test(text);
    const hasHeaders = /(?:^|\n)#{1,4}\s+|\b(?:rules|constraints|format|instructions|steps|context|input|output):\b/i.test(text);
    const hasDelimiters = /---|```|===|###/.test(text);

    if (hasBullets) score += 4;
    if (hasHeaders) score += 5;
    if (hasDelimiters) score += 3;

    // Explicit constraints
    let constraintCount = 0;
    for (const c of CONSTRAINT_WORDS) {
      if (lower.includes(c)) constraintCount += 1;
    }
    if (constraintCount >= 3) score += 6;
    else if (constraintCount >= 1) score += 4;

    return clamp(score, 0, 20);
  }

  function scoreContext(text) {
    if (!text) return 0;
    let score = 4;
    const lower = text.toLowerCase();

    // Role or persona definition
    const hasRole = ROLE_PATTERNS.some((pat) => pat.test(text));
    if (hasRole) score += 7;

    // Audience, scenario, implementation, or context framing
    const hasAudienceOrContext = /\b(?:target audience|context|background|scenario|assume that|the goal is|for beginners|for executives|production|implementation|use case|environment)\b/i.test(text);
    if (hasAudienceOrContext) score += 5;

    // Tone, domain, or stylistic guidance
    const hasTone = /\b(?:tone:|formal|concise|rigorous|technical|educational|neutral|playful|security|architecture|performance)\b/i.test(text);
    if (hasTone) score += 4;

    return clamp(score, 0, 20);
  }

  function scoreExamples(text) {
    if (!text) return 0;
    let score = 4;
    const lower = text.toLowerCase();

    // Explicit example mentions
    const hasExample = /\b(?:for example|e\.g\.|example|sample|expected output|expected result|sample input)\b/i.test(text);
    if (hasExample) score += 7;

    // Code fences or structured JSON/schema blocks
    const hasCodeBlock = /```[\s\S]*?```/.test(text) || /\{[\s\S]*?\}|\[[\s\S]*?\]/.test(text);
    if (hasCodeBlock) score += 6;

    // Paired input/output or before/after pattern
    const hasPairedPattern = (lower.includes('input') && lower.includes('output')) ||
                             (lower.includes('before') && lower.includes('after')) ||
                             (lower.includes('bad') && lower.includes('good'));
    if (hasPairedPattern) score += 3;

    return clamp(score, 0, 20);
  }

  function scoreEfficiency(text) {
    if (!text) return 0;
    let score = 10;
    const lower = text.toLowerCase();

    // Length appropriateness
    if (text.length < 15) {
      score = 4;
    } else if (text.length <= 1500) {
      score = 15;
    } else if (text.length <= 5000) {
      score = 12;
    } else {
      score = 8;
    }

    // Filler phrases deduction
    let fillerDeduction = 0;
    for (const phrase of FILLER_PHRASES) {
      if (lower.includes(phrase)) fillerDeduction += 2;
    }
    score -= fillerDeduction;

    // Formatting density check
    if (text.includes('\n\n') || text.includes('\n- ')) score += 3;

    return clamp(score, 0, 20);
  }

  function deriveGrade(totalScore) {
    if (totalScore >= 90) return 'S';
    if (totalScore >= 80) return 'A';
    if (totalScore >= 70) return 'B';
    if (totalScore >= 55) return 'C';
    return 'D';
  }

  function generateSuggestions(dimensions, text) {
    const suggestions = [];
    const lower = (text || '').toLowerCase();

    if (dimensions.clarity < 14) {
      suggestions.push('Define an explicit output format (e.g. JSON schema, Markdown table, or numbered steps).');
    }
    if (dimensions.structure < 14) {
      suggestions.push('Add negative constraints (e.g. "Do not include conversational preamble", "Avoid placeholder stubs").');
    }
    if (dimensions.context < 12) {
      suggestions.push('Specify a dedicated persona or role (e.g. "You are a Principal Security Architect").');
    }
    if (dimensions.examples < 10) {
      suggestions.push('Provide a short few-shot example or expected input/output sample.');
    }
    if (dimensions.efficiency < 14) {
      suggestions.push('Strip polite filler phrases ("Can you please", "I would like you to") to conserve tokens.');
    }

    if (suggestions.length === 0) {
      suggestions.push('Prompt structure is well-architected with clear constraints and framing.');
    }

    return suggestions;
  }

  function evaluateQuality(promptText) {
    const text = sanitizeString(promptText);
    if (!text) {
      return {
        score: 0,
        grade: 'D',
        dimensions: {
          clarity: 0,
          structure: 0,
          context: 0,
          examples: 0,
          efficiency: 0
        },
        suggestions: ['Enter prompt text to analyze quality score.']
      };
    }

    const clarity = scoreClarity(text);
    const structure = scoreStructure(text);
    const context = scoreContext(text);
    const examples = scoreExamples(text);
    const efficiency = scoreEfficiency(text);

    const totalScore = clamp(clarity + structure + context + examples + efficiency, 0, 100);
    const grade = deriveGrade(totalScore);
    const dimensions = { clarity, structure, context, examples, efficiency };
    const suggestions = generateSuggestions(dimensions, text);

    return {
      score: totalScore,
      grade,
      dimensions,
      suggestions
    };
  }

  function compareVariants(promptA, promptB, options = {}) {
    const evalA = evaluateQuality(promptA);
    const evalB = evaluateQuality(promptB);

    const delta = evalB.score - evalA.score;
    const dimensionDeltas = {
      clarity: evalB.dimensions.clarity - evalA.dimensions.clarity,
      structure: evalB.dimensions.structure - evalA.dimensions.structure,
      context: evalB.dimensions.context - evalA.dimensions.context,
      examples: evalB.dimensions.examples - evalA.dimensions.examples,
      efficiency: evalB.dimensions.efficiency - evalA.dimensions.efficiency
    };

    let winner = 'TIE';
    if (delta > 0) winner = 'B';
    else if (delta < 0) winner = 'A';

    const improvements = [];
    const regressions = [];

    for (const [dim, diff] of Object.entries(dimensionDeltas)) {
      if (diff > 0) improvements.push(`${dim} (+${diff})`);
      else if (diff < 0) regressions.push(`${dim} (${diff})`);
    }

    return {
      variantA: {
        label: options.labelA || 'Variant A',
        content: sanitizeString(promptA),
        ...evalA
      },
      variantB: {
        label: options.labelB || 'Variant B',
        content: sanitizeString(promptB),
        ...evalB
      },
      delta,
      winner,
      improvements,
      regressions,
      dimensionDeltas
    };
  }

  function createExperimentRecord({
    title = 'Prompt A/B Comparison',
    promptA = '',
    promptB = '',
    labelA = 'Variant A',
    labelB = 'Variant B',
    userWinner = '',
    notes = ''
  } = {}) {
    const comparison = compareVariants(promptA, promptB, { labelA, labelB });

    return {
      id: `ab_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      title: sanitizeString(title),
      comparison,
      userWinner: sanitizeString(userWinner) || comparison.winner,
      notes: sanitizeString(notes),
      createdAt: Date.now()
    };
  }

  async function loadExperiments() {
    if (!chrome?.storage?.local) return [];
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (data) => {
        const list = Array.isArray(data?.[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
        resolve(list);
      });
    });
  }

  async function saveExperiments(experiments) {
    if (!chrome?.storage?.local) return experiments;
    const cleanList = Array.isArray(experiments) ? experiments : [];
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: cleanList }, () => {
        resolve(cleanList);
      });
    });
  }

  async function deleteExperiment(id) {
    const current = await loadExperiments();
    const filtered = current.filter((exp) => exp.id !== id);
    await saveExperiments(filtered);
    return filtered;
  }

  const moduleExports = {
    evaluateQuality,
    compareVariants,
    createExperimentRecord,
    loadExperiments,
    saveExperiments,
    deleteExperiment,
    STORAGE_KEY
  };

  globalScope.ZeusQualityScorer = moduleExports;
})(typeof globalThis !== 'undefined' ? globalThis : this);
