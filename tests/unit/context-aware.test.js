const { JSDOM } = require('jsdom');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Context-Aware Multi-Turn Enhancement', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/domUtils.js');
    loadScript('core/prompts.js');
    loadScript('settings/settings.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  describe('DOM Conversation Turn Extraction', () => {
    it('extracts turns from ChatGPT data-message-author-role elements', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div data-message-author-role="user">Can you write a sorting function in JS?</div>
            <div data-message-author-role="assistant">Here is an implementation of quicksort.</div>
            <div data-message-author-role="user">Now make it faster and add type annotations.</div>
          </body>
        </html>
      `);

      const turns = globalThis.ZeusDomUtils.extractConversationTurns(dom.window.document, { maxTurns: 4 });
      expect(turns.length).toBe(3);
      expect(turns[0]).toEqual({ role: 'user', text: 'Can you write a sorting function in JS?' });
      expect(turns[1]).toEqual({ role: 'assistant', text: 'Here is an implementation of quicksort.' });
      expect(turns[2]).toEqual({ role: 'user', text: 'Now make it faster and add type annotations.' });
    });

    it('extracts turns from Claude style message elements', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div class="font-user-message">Explain event loops in Node.js.</div>
            <div class="font-claude-message">The event loop is what allows Node.js to perform non-blocking I/O operations.</div>
          </body>
        </html>
      `);

      const turns = globalThis.ZeusDomUtils.extractConversationTurns(dom.window.document, { maxTurns: 4 });
      expect(turns.length).toBe(2);
      expect(turns[0].role).toBe('user');
      expect(turns[1].role).toBe('assistant');
    });

    it('extracts turns from Gemini custom tags user-query and model-response', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <user-query>How do I configure nginx reverse proxy?</user-query>
            <model-response>Here is the nginx server block configuration.</model-response>
          </body>
        </html>
      `);

      const turns = globalThis.ZeusDomUtils.extractConversationTurns(dom.window.document);
      expect(turns.length).toBe(2);
      expect(turns[0].role).toBe('user');
      expect(turns[1].role).toBe('assistant');
    });

    it('respects maxTurns parameter by keeping only the most recent turns', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div data-message-author-role="user">Turn 1</div>
            <div data-message-author-role="assistant">Turn 2</div>
            <div data-message-author-role="user">Turn 3</div>
            <div data-message-author-role="assistant">Turn 4</div>
            <div data-message-author-role="user">Turn 5</div>
          </body>
        </html>
      `);

      const turns = globalThis.ZeusDomUtils.extractConversationTurns(dom.window.document, { maxTurns: 2 });
      expect(turns.length).toBe(2);
      expect(turns[0].text).toBe('Turn 4');
      expect(turns[1].text).toBe('Turn 5');
    });

    it('truncates long messages according to character bounds', () => {
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div data-message-author-role="user">` + 'A'.repeat(600) + `</div>
          </body>
        </html>
      `);

      const turns = globalThis.ZeusDomUtils.extractConversationTurns(dom.window.document, { maxCharsPerTurn: 200 });
      expect(turns.length).toBe(1);
      expect(turns[0].text.length).toBeLessThanOrEqual(203); // 200 chars + '...'
      expect(turns[0].text.endsWith('...')).toBe(true);
    });

    it('returns empty array when no message containers are present', () => {
      const dom = new JSDOM('<!DOCTYPE html><html><body><p>Hello world</p></body></html>');
      const turns = globalThis.ZeusDomUtils.extractConversationTurns(dom.window.document);
      expect(turns).toEqual([]);
    });
  });

  describe('Prompt Context Formatting and Builder', () => {
    it('formats turns array into structured transcript', () => {
      const turns = [
        { role: 'user', text: 'Refactor this code' },
        { role: 'assistant', text: 'function add(a, b) { return a + b; }' }
      ];

      const formatted = globalThis.ZeusPrompts.formatConversationContext(turns);
      expect(formatted).toContain('[User]: Refactor this code');
      expect(formatted).toContain('[Assistant]: function add(a, b) { return a + b; }');
    });

    it('injects conversation context and coreference resolution instructions into buildEnhancePrompt', () => {
      const turns = [
        { role: 'user', text: 'What is the capital of France?' },
        { role: 'assistant', text: 'Paris.' }
      ];

      const enhanced = globalThis.ZeusPrompts.buildEnhancePrompt('Why is it famous?', {
        conversationContext: turns
      });

      expect(enhanced).toContain('CONVERSATION CONTEXT (RECENT TURNS):');
      expect(enhanced).toContain('[User]: What is the capital of France?');
      expect(enhanced).toContain('[Assistant]: Paris.');
      expect(enhanced).toContain('CONTEXT RESOLUTION RULES:');
      expect(enhanced).toContain('Resolve ambiguous references, pronouns (it, that, this, the previous one) using context.');
      expect(enhanced).toContain('ORIGINAL PROMPT:\nWhy is it famous?');
    });

    it('preserves exact golden output when conversation context is omitted', () => {
      const withoutContext = globalThis.ZeusPrompts.buildEnhancePrompt('Test prompt');
      expect(withoutContext).not.toContain('CONVERSATION CONTEXT');
      expect(withoutContext).not.toContain('CONTEXT RESOLUTION RULES');
    });
  });

  describe('Settings Schema Integration', () => {
    it('provides default settings for context-aware enhancement', () => {
      const defaults = globalThis.ZeusSettings.createDefaultSettings();
      expect(defaults.contextAwareEnabled).toBe(true);
      expect(defaults.contextMaxTurns).toBe(4);
      expect(defaults.contextMaxChars).toBe(2000);
    });

    it('normalizes and bounds context turns and character limits', () => {
      const normalized = globalThis.ZeusSettings.normalizeSettings({
        contextAwareEnabled: false,
        contextMaxTurns: 99,
        contextMaxChars: 50
      });

      expect(normalized.contextAwareEnabled).toBe(false);
      expect(normalized.contextMaxTurns).toBe(10); // Clamped to 10 max
      expect(normalized.contextMaxChars).toBe(200); // Clamped to 200 min
    });
  });
});
