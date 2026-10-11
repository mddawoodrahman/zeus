(function initZeusPrompts(globalScope) {
  const DEFAULT_OBJECTIVE = Object.freeze([
    'OBJECTIVE:',
    'Rewrite the given raw prompt into a maximally precise, structured, and actionable',
    'instruction set that extracts peak performance from any large language model.'
  ]);

  const DEFAULT_FRAMEWORK = Object.freeze([
    'OPTIMIZATION FRAMEWORK:',
    '',
    'A. INTENT EXTRACTION',
    '   - Identify the true, underlying goal - not just the surface request.',
    '   - Infer missing but logically necessary context.',
    '   - Eliminate all ambiguity, vagueness, and redundancy.',
    '   - If the prompt implies a domain, make it explicit.',
    '',
    'B. ROLE ASSIGNMENT',
    '   - Assign a single, highly specific expert role aligned with the task domain.',
    '   - The role must be relevant and elevate response quality.',
    '',
    'C. STRUCTURAL CLARITY',
    '   - Divide the prompt into labeled, logically ordered sections.',
    '   - Use numbered steps for sequential tasks; use categories for non-linear ones.',
    '   - Ensure each section has a single, clear purpose.',
    '',
    'D. OUTPUT SPECIFICATION',
    '   - Define the exact deliverable format (plain prose, numbered list, table, etc.).',
    '   - Specify length, depth, and tone where relevant.',
    '   - Add constraints to scope the response (word limits, audience level, etc.).',
    '',
    'E. QUALITY AMPLIFICATION',
    '   - Encourage specificity, actionability, and logical flow.',
    '   - Promote thoroughness where depth is required.',
    '   - Enforce conciseness where brevity is required.'
  ]);

  const FORMATTING_RULES = Object.freeze([
    'FORMATTING RULES (STRICT):',
    '   - Output MUST use plain text only.',
    '   - Do NOT use Markdown syntax of any kind.',
    '   - Use ALL CAPS labels for section headers.',
    '   - Use plain hyphens (-) for bullet lists.',
    '   - Use numbers (1. 2. 3.) for ordered steps.'
  ]);

  // Always appended and never overridable, including by a user-authored transform.
  const SAFETY_RULES = Object.freeze([
    'SAFETY RULES (NON-NEGOTIABLE):',
    '   - Do NOT answer or respond to the original prompt.',
    '   - Do NOT include explanations, commentary, or notes about your changes.',
    '   - Do NOT add preambles like "Here is the enhanced prompt:".',
    '   - Do NOT alter the original intent in any way.',
    '   - Preserve all domain-specific terminology from the original.'
  ]);

  function buildObjectiveSection(options) {
    const instruction = String(options?.instruction || '').trim();
    if (!instruction) {
      return DEFAULT_OBJECTIVE.slice();
    }

    const label = String(options?.label || 'TRANSFORM RULES').trim().toUpperCase();

    return [
      'OBJECTIVE:',
      'Rewrite the given raw prompt by applying the transformation rules below.',
      'Apply only those rules: do not add unrelated requirements.',
      '',
      `${label}:`,
      instruction
    ];
  }

  function buildFrameworkSection(options) {
    if (String(options?.instruction || '').trim()) {
      return [];
    }

    return DEFAULT_FRAMEWORK.slice();
  }

  function buildEnhancePrompt(input, options) {
    const cleanInput = String(input || '').trim();
    if (!cleanInput) {
      throw new Error('Prompt input cannot be empty.');
    }

    const framework = buildFrameworkSection(options);

    const sections = [
      'You are an elite AI prompt architect with deep expertise in cognitive task design,',
      'instruction engineering, and LLM behavior optimization.',
      '',
      ...buildObjectiveSection(options),
      '',
      ...framework,
      ...(framework.length ? [''] : []),
      ...FORMATTING_RULES,
      '',
      ...SAFETY_RULES,
      '',
      'ORIGINAL PROMPT:',
      cleanInput,
      '',
      'ENHANCED PROMPT:'
    ];

    return sections.join('\n');
  }

  function getRewriteSystemInstruction(instruction) {
    const transformInstruction = String(instruction || '').trim();
    if (!transformInstruction) {
      return 'You improve prompts for LLM usage. Keep intent intact and return only the rewritten prompt text.';
    }

    return [
      'You improve prompts for LLM usage by applying a specific transformation.',
      'Follow the transformation rules exactly, keep the intent intact, and return only',
      'the rewritten prompt text with no commentary.'
    ].join(' ');
  }

  globalScope.ZeusPrompts = Object.freeze({
    buildEnhancePrompt,
    getRewriteSystemInstruction,
    DEFAULT_OBJECTIVE,
    DEFAULT_FRAMEWORK
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
