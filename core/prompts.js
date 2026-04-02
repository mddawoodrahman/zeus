(function initZeusPrompts(globalScope) {
  function buildEnhancePrompt(input) {
    const cleanInput = String(input || '').trim();
    if (!cleanInput) {
      throw new Error('Prompt input cannot be empty.');
    }

    const sections = [
      'You are an elite AI prompt architect with deep expertise in cognitive task design,',
      'instruction engineering, and LLM behavior optimization.',
      '',
      'OBJECTIVE:',
      'Rewrite the given raw prompt into a maximally precise, structured, and actionable',
      'instruction set that extracts peak performance from any large language model.',
      '',
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
      '   - Enforce conciseness where brevity is required.',
      '',
      'FORMATTING RULES (STRICT):',
      '   - Output MUST use plain text only.',
      '   - Do NOT use Markdown syntax of any kind.',
      '   - Use ALL CAPS labels for section headers.',
      '   - Use plain hyphens (-) for bullet lists.',
      '   - Use numbers (1. 2. 3.) for ordered steps.',
      '',
      'SAFETY RULES (NON-NEGOTIABLE):',
      '   - Do NOT answer or respond to the original prompt.',
      '   - Do NOT include explanations, commentary, or notes about your changes.',
      '   - Do NOT add preambles like "Here is the enhanced prompt:".',
      '   - Do NOT alter the original intent in any way.',
      '   - Preserve all domain-specific terminology from the original.',
      '',
      'ORIGINAL PROMPT:',
      cleanInput,
      '',
      'ENHANCED PROMPT:'
    ];

    return sections.join('\n');
  }

  function getRewriteSystemInstruction() {
    return 'You improve prompts for LLM usage. Keep intent intact and return only the rewritten prompt text.';
  }

  globalScope.ZeusPrompts = Object.freeze({
    buildEnhancePrompt,
    getRewriteSystemInstruction
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
