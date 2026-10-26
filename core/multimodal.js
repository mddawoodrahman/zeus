(function registerMultimodalModule(globalScope) {
  const CATEGORY_KEYWORDS = {
    'ui-code': [
      'ui', 'mockup', 'figma', 'design', 'css', 'html', 'tailwind',
      'component', 'frontend', 'button', 'screen', 'screenshot', 'layout', 'wireframe',
      'web page', 'dashboard', 'interface', 'widget'
    ],
    'error-debug': [
      'error', 'bug', 'traceback', 'exception', 'fail', 'stack trace',
      'console', 'terminal', 'log', 'crash', 'exit code', 'stderr',
      'unhandled rejection', 'segfault', 'syntax error'
    ],
    'diagram-analysis': [
      'diagram', 'flowchart', 'architecture', 'sequence', 'schema',
      'graph', 'er diagram', 'system design', 'pipeline', 'workflow',
      'state machine', 'uml', 'cloud architecture', 'topology'
    ],
    'document-extract': [
      'receipt', 'invoice', 'document', 'table', 'ocr', 'scan',
      'text from image', 'pdf', 'form', 'contract', 'statement', 'transcribe'
    ]
  };

  const CATEGORY_DIRECTIVES = {
    'ui-code': [
      '1. Visually deconstruct the UI component hierarchy, spatial grid, layout structure, and spacing.',
      '2. Extract the exact color palette (hex/rgb), typography, borders, and visual styling cues.',
      '3. Generate semantic, accessible, and responsive code (HTML/CSS or modern components) implementing the visible design faithfully.'
    ],
    'error-debug': [
      '1. Transcribe the exact visible error message, exception type, and stack trace lines from the image.',
      '2. Pinpoint the offending file, function, and line number indicated in the visual trace.',
      '3. Provide a step-by-step root cause analysis and verified code fix addressing the visible defect.'
    ],
    'diagram-analysis': [
      '1. Identify all nodes, components, and data stores illustrated in the diagram.',
      '2. Trace directed flow arrows, communication protocols, and synchronous vs asynchronous boundaries.',
      '3. Highlight potential architectural bottlenecks, single points of failure, or security perimeters.'
    ],
    'document-extract': [
      '1. Transcribe all visible text with high OCR accuracy, preserving original structural alignment.',
      '2. Convert visible tables into structured Markdown tables or key-value data models.',
      '3. Explicitly flag any ambiguous or low-confidence characters.'
    ],
    'general-vision': [
      '1. Ground all reasoning strictly in the visible visual details, objects, and text in the image.',
      '2. Note spatial layout, orientation, and prominent visual artifacts.',
      '3. Respond with high visual fidelity, clarity, and structural precision.'
    ]
  };

  function sanitizeString(val) {
    return String(val == null ? '' : val).trim();
  }

  function detectVisualAttachmentType(metadata = {}, textPrompt = '') {
    const preset = sanitizeString(metadata?.preset || metadata?.category).toLowerCase();
    if (CATEGORY_DIRECTIVES[preset]) {
      return preset;
    }

    const combinedText = `${sanitizeString(metadata?.fileName)} ${sanitizeString(metadata?.name)} ${sanitizeString(metadata?.alt)} ${sanitizeString(textPrompt)}`.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(combinedText);
      })) {
        return category;
      }
    }

    return 'general-vision';
  }

  function normalizeAttachment(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        id: `att-${Date.now()}`,
        type: 'image',
        name: 'attachment_image',
        fileName: 'attachment_image',
        mimeType: 'image/png',
        mediaType: 'image/png',
        category: 'general-vision',
        width: null,
        height: null,
        sizeBytes: null,
        dataUrl: null,
        hasDataUrl: false,
        previewUrl: null
      };
    }

    const fileName = sanitizeString(raw.fileName || raw.name || 'visual_artifact.png');
    const mediaType = sanitizeString(raw.mediaType || raw.type || raw.mimeType || 'image/png');
    const category = detectVisualAttachmentType(raw, raw.context || '');

    return {
      id: raw.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'image',
      name: fileName,
      fileName,
      mimeType: mediaType,
      mediaType,
      category,
      width: Number(raw.width) || null,
      height: Number(raw.height) || null,
      sizeBytes: Number(raw.sizeBytes || raw.size) || null,
      dataUrl: typeof raw.dataUrl === 'string' ? raw.dataUrl : (typeof raw.previewUrl === 'string' ? raw.previewUrl : null),
      hasDataUrl: Boolean(raw.dataUrl || raw.previewUrl),
      previewUrl: typeof raw.previewUrl === 'string' ? raw.previewUrl : (typeof raw.dataUrl === 'string' ? raw.dataUrl : null)
    };
  }

  function formatMultimodalDirectives(attachments, options = {}) {
    const list = Array.isArray(attachments)
      ? attachments.map(normalizeAttachment).filter(Boolean)
      : (attachments ? [normalizeAttachment(attachments)].filter(Boolean) : []);

    if (list.length === 0) {
      return '';
    }

    const sections = [];
    sections.push('MULTIMODAL ARTIFACT CONTEXT:');

    list.forEach((att, idx) => {
      const label = att.fileName || att.name || `Attachment #${idx + 1}`;
      const cat = att.category || 'general-vision';
      sections.push(`- [Visual Media ${idx + 1}]: ${label} (Detected Domain: ${cat.toUpperCase()})`);
    });

    const primaryCategory = (options?.visionOptimizationPreset && options.visionOptimizationPreset !== 'auto')
      ? options.visionOptimizationPreset
      : (list[0]?.category || 'general-vision');
    const directives = CATEGORY_DIRECTIVES[primaryCategory] || CATEGORY_DIRECTIVES['general-vision'];

    sections.push('');
    sections.push(`MULTIMODAL REASONING DIRECTIVES (${primaryCategory.toUpperCase()}):`);
    directives.forEach((dir) => sections.push(dir));

    return sections.join('\n');
  }

  function extractAttachedImagesFromDOM(docNode) {
    if (!docNode || typeof docNode.querySelectorAll !== 'function') {
      return [];
    }

    const selectors = [
      'div[data-testid*="image"] img',
      'div[data-testid*="file-upload"] img',
      'div[data-testid*="attachment"] img',
      'div[class*="upload"] img',
      'div[class*="thumbnail"] img',
      'user-query img',
      'img[src*="blob:"]',
      'img[src*="data:image"]'
    ];

    const results = [];
    const seenSrcs = new Set();

    for (const selector of selectors) {
      const nodes = docNode.querySelectorAll(selector);
      for (const node of nodes) {
        const src = (typeof node.getAttribute === 'function' ? node.getAttribute('src') : node.src) || '';
        if (!src || seenSrcs.has(src)) continue;
        // Ignore tiny icon avatars
        const width = node.naturalWidth || node.width || 0;
        const height = node.naturalHeight || node.height || 0;
        if (width > 0 && width < 32 && height > 0 && height < 32) continue;

        seenSrcs.add(src);
        const alt = (typeof node.getAttribute === 'function' ? node.getAttribute('alt') : node.alt) || '';
        results.push(normalizeAttachment({
          name: alt || 'attached_image.png',
          fileName: alt || 'attached_image.png',
          mediaType: src.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
          width,
          height,
          previewUrl: src.startsWith('data:') ? src : null
        }));
      }
    }

    return results;
  }

  const moduleExports = {
    detectVisualAttachmentType,
    normalizeAttachment,
    formatMultimodalDirectives,
    extractAttachedImagesFromDOM,
    CATEGORY_KEYWORDS,
    CATEGORY_DIRECTIVES,
    VISUAL_CATEGORIES: Object.keys(CATEGORY_DIRECTIVES)
  };

  globalScope.ZeusMultimodal = moduleExports;
})(typeof globalThis !== 'undefined' ? globalThis : this);
