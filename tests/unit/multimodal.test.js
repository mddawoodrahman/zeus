const { loadScript, clearZeusGlobals } = require('../utils/runtime');

const GOLDEN_DEFAULT_PROMPT = [
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
  'write me a poem',
  '',
  'ENHANCED PROMPT:'
].join('\n');

describe('ZeusMultimodal', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/multimodal.js');
    loadScript('core/prompts.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('exports ZeusMultimodal on globalScope with required interfaces', () => {
    expect(globalThis.ZeusMultimodal).toBeDefined();
    expect(typeof globalThis.ZeusMultimodal.detectVisualAttachmentType).toBe('function');
    expect(typeof globalThis.ZeusMultimodal.normalizeAttachment).toBe('function');
    expect(typeof globalThis.ZeusMultimodal.formatMultimodalDirectives).toBe('function');
    expect(typeof globalThis.ZeusMultimodal.extractAttachedImagesFromDOM).toBe('function');
    expect(globalThis.ZeusMultimodal.VISUAL_CATEGORIES).toBeDefined();
  });

  describe('detectVisualAttachmentType', () => {
    it('detects ui-code category from filenames and hints', () => {
      const { detectVisualAttachmentType } = globalThis.ZeusMultimodal;
      expect(detectVisualAttachmentType({ name: 'landing_mockup.png' })).toBe('ui-code');
      expect(detectVisualAttachmentType({ name: 'wireframe_v2.jpg' })).toBe('ui-code');
      expect(detectVisualAttachmentType({ name: 'figma_export_dashboard.png' })).toBe('ui-code');
      expect(detectVisualAttachmentType({ name: 'component_screenshot.png' })).toBe('ui-code');
      expect(detectVisualAttachmentType({ name: 'app_ui.webp' })).toBe('ui-code');
    });

    it('detects error-debug category from filenames and hints', () => {
      const { detectVisualAttachmentType } = globalThis.ZeusMultimodal;
      expect(detectVisualAttachmentType({ name: 'stacktrace_error.png' })).toBe('error-debug');
      expect(detectVisualAttachmentType({ name: 'terminal_crash.jpg' })).toBe('error-debug');
      expect(detectVisualAttachmentType({ name: 'console_exception.png' })).toBe('error-debug');
      expect(detectVisualAttachmentType({ name: 'app_bug_repro.png' })).toBe('error-debug');
      expect(detectVisualAttachmentType({ name: 'traceback_output.png' })).toBe('error-debug');
    });

    it('detects diagram-analysis category from filenames and hints', () => {
      const { detectVisualAttachmentType } = globalThis.ZeusMultimodal;
      expect(detectVisualAttachmentType({ name: 'database_schema.png' })).toBe('diagram-analysis');
      expect(detectVisualAttachmentType({ name: 'system_architecture.svg' })).toBe('diagram-analysis');
      expect(detectVisualAttachmentType({ name: 'flowchart_user_journey.jpg' })).toBe('diagram-analysis');
      expect(detectVisualAttachmentType({ name: 'network_topology.png' })).toBe('diagram-analysis');
      expect(detectVisualAttachmentType({ name: 'erd_diagram.png' })).toBe('diagram-analysis');
    });

    it('detects document-extract category from filenames and hints', () => {
      const { detectVisualAttachmentType } = globalThis.ZeusMultimodal;
      expect(detectVisualAttachmentType({ name: 'invoice_2026.pdf' })).toBe('document-extract');
      expect(detectVisualAttachmentType({ name: 'store_receipt.png' })).toBe('document-extract');
      expect(detectVisualAttachmentType({ name: 'document_scan.jpg' })).toBe('document-extract');
      expect(detectVisualAttachmentType({ name: 'financial_table.png' })).toBe('document-extract');
      expect(detectVisualAttachmentType({ name: 'ocr_paper.jpg' })).toBe('document-extract');
    });

    it('defaults to general-vision for neutral or unclassified images', () => {
      const { detectVisualAttachmentType } = globalThis.ZeusMultimodal;
      expect(detectVisualAttachmentType({ name: 'nature_photo.jpg' })).toBe('general-vision');
      expect(detectVisualAttachmentType({ name: 'cat.png' })).toBe('general-vision');
      expect(detectVisualAttachmentType({})).toBe('general-vision');
      expect(detectVisualAttachmentType(null)).toBe('general-vision');
    });
  });

  describe('normalizeAttachment', () => {
    it('normalizes attachment object with default fallback values and category', () => {
      const { normalizeAttachment } = globalThis.ZeusMultimodal;
      const normalized = normalizeAttachment({
        name: 'my_dashboard_mockup.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      });

      expect(normalized.id).toBeDefined();
      expect(normalized.name).toBe('my_dashboard_mockup.png');
      expect(normalized.mimeType).toBe('image/png');
      expect(normalized.category).toBe('ui-code');
      expect(normalized.hasDataUrl).toBe(true);
    });

    it('handles null, undefined, or empty objects safely', () => {
      const { normalizeAttachment } = globalThis.ZeusMultimodal;
      const normalized = normalizeAttachment(null);
      expect(normalized.name).toBe('attachment_image');
      expect(normalized.category).toBe('general-vision');
      expect(normalized.mimeType).toBe('image/png');
    });
  });

  describe('formatMultimodalDirectives', () => {
    it('returns empty string when attachments are null or empty array', () => {
      const { formatMultimodalDirectives } = globalThis.ZeusMultimodal;
      expect(formatMultimodalDirectives(null)).toBe('');
      expect(formatMultimodalDirectives([])).toBe('');
      expect(formatMultimodalDirectives(undefined)).toBe('');
    });

    it('generates UI/code directives when visual attachment is ui-code', () => {
      const { formatMultimodalDirectives } = globalThis.ZeusMultimodal;
      const directives = formatMultimodalDirectives([
        { name: 'checkout_ui_wireframe.png', category: 'ui-code' }
      ]);

      expect(directives).toContain('MULTIMODAL ARTIFACT CONTEXT:');
      expect(directives).toContain('MULTIMODAL REASONING DIRECTIVES (UI-CODE):');
      expect(directives).toContain('checkout_ui_wireframe.png');
      expect(directives).toContain('semantic, accessible, and responsive code');
    });

    it('generates error debugging directives when visual attachment is error-debug', () => {
      const { formatMultimodalDirectives } = globalThis.ZeusMultimodal;
      const directives = formatMultimodalDirectives([
        { name: 'terminal_stacktrace.png', category: 'error-debug' }
      ]);

      expect(directives).toContain('MULTIMODAL ARTIFACT CONTEXT:');
      expect(directives).toContain('MULTIMODAL REASONING DIRECTIVES (ERROR-DEBUG):');
      expect(directives).toContain('terminal_stacktrace.png');
      expect(directives).toContain('error message, exception type, and stack trace');
      expect(directives).toContain('root cause');
    });

    it('generates diagram directives when visual attachment is diagram-analysis', () => {
      const { formatMultimodalDirectives } = globalThis.ZeusMultimodal;
      const directives = formatMultimodalDirectives([
        { name: 'architecture_flowchart.png', category: 'diagram-analysis' }
      ]);

      expect(directives).toContain('MULTIMODAL ARTIFACT CONTEXT:');
      expect(directives).toContain('MULTIMODAL REASONING DIRECTIVES (DIAGRAM-ANALYSIS):');
      expect(directives).toContain('nodes, components, and data stores');
      expect(directives).toContain('communication protocols');
    });

    it('generates OCR directives when visual attachment is document-extract', () => {
      const { formatMultimodalDirectives } = globalThis.ZeusMultimodal;
      const directives = formatMultimodalDirectives([
        { name: 'tax_invoice_scan.pdf', category: 'document-extract' }
      ]);

      expect(directives).toContain('MULTIMODAL ARTIFACT CONTEXT:');
      expect(directives).toContain('MULTIMODAL REASONING DIRECTIVES (DOCUMENT-EXTRACT):');
      expect(directives).toContain('Transcribe all visible text');
      expect(directives).toContain('tables into structured Markdown');
    });

    it('respects visionOptimizationPreset override in options', () => {
      const { formatMultimodalDirectives } = globalThis.ZeusMultimodal;
      const directives = formatMultimodalDirectives(
        [{ name: 'random_photo.jpg' }],
        { visionOptimizationPreset: 'ui-code' }
      );

      expect(directives).toContain('MULTIMODAL REASONING DIRECTIVES (UI-CODE):');
    });
  });

  describe('Prompt Integration & Golden Byte Invariance', () => {
    it('preserves byte-identical golden default prompt when attachments are absent', () => {
      const output = globalThis.ZeusPrompts.buildEnhancePrompt('write me a poem');
      expect(output).toBe(GOLDEN_DEFAULT_PROMPT);
    });

    it('preserves byte-identical golden default prompt when attachments is empty array', () => {
      const output = globalThis.ZeusPrompts.buildEnhancePrompt('write me a poem', { attachments: [] });
      expect(output).toBe(GOLDEN_DEFAULT_PROMPT);
    });

    it('injects visual multimodal instructions when attachments are provided', () => {
      const output = globalThis.ZeusPrompts.buildEnhancePrompt('recreate this login card', {
        attachments: [
          { name: 'login_mockup.png' }
        ]
      });

      expect(output).not.toBe(GOLDEN_DEFAULT_PROMPT);
      expect(output).toContain('MULTIMODAL ARTIFACT CONTEXT:');
      expect(output).toContain('MULTIMODAL REASONING DIRECTIVES (UI-CODE):');
      expect(output).toContain('login_mockup.png');
      expect(output).toContain('ORIGINAL PROMPT:\nrecreate this login card');
      expect(output).toContain('ENHANCED PROMPT:');
    });
  });

  describe('extractAttachedImagesFromDOM', () => {
    it('returns empty array when document or elements are missing', () => {
      const { extractAttachedImagesFromDOM } = globalThis.ZeusMultimodal;
      expect(extractAttachedImagesFromDOM(null)).toEqual([]);
      expect(extractAttachedImagesFromDOM({})).toEqual([]);
    });

    it('extracts uploaded image elements from DOM containers', () => {
      const { extractAttachedImagesFromDOM } = globalThis.ZeusMultimodal;
      const mockDoc = {
        querySelectorAll: (selector) => {
          if (selector.includes('img') || selector.includes('preview')) {
            return [
              {
                tagName: 'IMG',
                src: 'blob:https://chatgpt.com/1234-abcd',
                alt: 'User uploaded screenshot',
                width: 400,
                height: 300,
                closest: () => ({ classList: { contains: () => true } })
              }
            ];
          }
          return [];
        }
      };

      const extracted = extractAttachedImagesFromDOM(mockDoc);
      expect(extracted.length).toBe(1);
      expect(extracted[0].name).toBe('User uploaded screenshot');
      expect(extracted[0].category).toBe('ui-code');
    });
  });

  describe('Router Smart Routing with Vision Intent', () => {
    beforeEach(() => {
      loadScript('model-registry.js');
      loadScript('settings/settings.js');
      loadScript('core/router.js');
    });

    it('auto-elevates intent to vision when attachments are present', () => {
      const analysis = globalThis.ZeusRouter.analyzePrompt('make this look better', {
        attachments: [{ name: 'navbar_mockup.png' }]
      });

      expect(analysis.intent).toBe('vision');
      expect(analysis.hasAttachments).toBe(true);
      expect(analysis.attachmentsCount).toBe(1);
    });

    it('routes vision intent to a high-capability vision model in autoRouteForIntent', () => {
      const route = globalThis.ZeusRouter.autoRouteForIntent('vision', { profile: 'balanced' });
      expect(route.provider).toBe('gemini');
      expect(route.model).toBeDefined();
    });
  });
});
