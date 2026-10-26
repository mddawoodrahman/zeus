const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusCommandPalette Unit Tests', () => {
  beforeEach(() => {
    clearZeusGlobals();

    globalThis.chrome = {
      storage: {
        sync: {
          get: vi.fn((keys, cb) => cb({})),
          set: vi.fn((obj, cb) => {
            if (cb) cb();
          })
        }
      },
      runtime: {
        lastError: null
      }
    };

    loadScript('core/commandPalette.js');
    loadScript('settings/settings.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  describe('Command Registry', () => {
    it('registers valid commands and retrieves them', () => {
      const { CommandRegistry } = globalThis.ZeusCommandPalette;
      const registry = new CommandRegistry();

      const cmd = registry.register({
        id: 'test-optimize',
        title: 'Optimize Prompt',
        description: 'Rewrite prompt for LLM',
        category: 'Actions',
        shortcut: 'Ctrl+Enter',
        icon: '⚡',
        handler: vi.fn()
      });

      expect(cmd.id).toBe('test-optimize');
      expect(registry.get('test-optimize')).toBeDefined();
      expect(registry.getAll()).toHaveLength(1);
    });

    it('throws error when registering a command without id or title', () => {
      const { CommandRegistry } = globalThis.ZeusCommandPalette;
      const registry = new CommandRegistry();

      expect(() => registry.register({ title: 'No ID' })).toThrow();
      expect(() => registry.register({ id: 'no-title' })).toThrow();
    });

    it('unregisters commands by id', () => {
      const { CommandRegistry } = globalThis.ZeusCommandPalette;
      const registry = new CommandRegistry();

      registry.register({ id: 'c1', title: 'Command 1' });
      registry.register({ id: 'c2', title: 'Command 2' });

      expect(registry.getAll()).toHaveLength(2);
      expect(registry.unregister('c1')).toBe(true);
      expect(registry.getAll()).toHaveLength(1);
      expect(registry.get('c1')).toBeNull();
    });

    it('executes a command handler by id', () => {
      const { CommandRegistry } = globalThis.ZeusCommandPalette;
      const registry = new CommandRegistry();
      const mockHandler = vi.fn((ctx) => `Executed with ${ctx.mode}`);

      registry.register({
        id: 'c-run',
        title: 'Run Action',
        handler: mockHandler
      });

      const result = registry.execute('c-run', { mode: 'fast' });
      expect(mockHandler).toHaveBeenCalledWith({ mode: 'fast' });
      expect(result).toBe('Executed with fast');
    });

    it('throws error when executing a non-existent command', () => {
      const { CommandRegistry } = globalThis.ZeusCommandPalette;
      const registry = new CommandRegistry();

      expect(() => registry.execute('missing-id')).toThrow("Command 'missing-id' not found.");
    });
  });

  describe('Fuzzy Search and Ranking', () => {
    let commands;

    beforeEach(() => {
      commands = [
        { id: '1', title: 'Optimize Prompt', description: 'Rewrite current prompt', category: 'Actions', shortcut: 'Ctrl+Enter' },
        { id: '2', title: 'Capture from Page', description: 'Pull prompt from webpage', category: 'Actions', shortcut: 'Ctrl+Shift+U' },
        { id: '3', title: 'Copy Output', description: 'Copy prompt to clipboard', category: 'Actions', shortcut: 'Ctrl+Shift+C' },
        { id: '4', title: 'Switch to Transforms', description: 'Open transforms tab', category: 'Navigation' },
        { id: '5', title: 'Switch to History', description: 'Browse prompt archive', category: 'Navigation' },
        { id: '6', title: 'Toggle Privacy Shield', description: 'Mask and unmask PII', category: 'Actions', shortcut: 'Ctrl+Shift+P' },
        { id: '7', title: 'Transform: ELI5', description: 'Explain like I am 5', category: 'Transforms' },
        { id: '8', title: 'Workflow: Two-Pass Optimization', description: 'Multi-step chaining', category: 'Workflows' }
      ];
    });

    it('returns all commands when query is empty', () => {
      const { fuzzySearch } = globalThis.ZeusCommandPalette;
      const results = fuzzySearch('', commands);
      expect(results).toHaveLength(commands.length);
    });

    it('ranks exact and prefix title matches highest', () => {
      const { fuzzySearch } = globalThis.ZeusCommandPalette;
      const results = fuzzySearch('optimize', commands);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Optimize Prompt');
    });

    it('matches by shortcut combination', () => {
      const { fuzzySearch } = globalThis.ZeusCommandPalette;
      const results = fuzzySearch('ctrl+enter', commands);
      expect(results[0].id).toBe('1');
    });

    it('matches by acronym', () => {
      const { fuzzySearch } = globalThis.ZeusCommandPalette;
      // 'tps' -> Toggle Privacy Shield
      const results = fuzzySearch('tps', commands);
      expect(results.some((r) => r.id === '6')).toBe(true);
    });

    it('matches by category or description', () => {
      const { fuzzySearch } = globalThis.ZeusCommandPalette;
      const results = fuzzySearch('navigation', commands);
      expect(results.every((r) => r.category === 'Navigation')).toBe(true);

      const descResults = fuzzySearch('clipboard', commands);
      expect(descResults[0].title).toBe('Copy Output');
    });

    it('returns empty array when nothing matches query', () => {
      const { fuzzySearch } = globalThis.ZeusCommandPalette;
      const results = fuzzySearch('zyxwvutsrqponm', commands);
      expect(results).toHaveLength(0);
    });
  });

  describe('Settings Integration', () => {
    it('provides default command palette settings', () => {
      const defaults = globalThis.ZeusSettings.createDefaultSettings();

      expect(defaults.commandPaletteEnabled).toBe(true);
      expect(defaults.commandPaletteShortcut).toBe('Ctrl+K');
      expect(defaults.keyboardShortcutsEnabled).toBe(true);
    });

    it('normalizes and serializes command palette settings', () => {
      const raw = {
        commandPaletteEnabled: false,
        commandPaletteShortcut: 'Cmd+Shift+P',
        keyboardShortcutsEnabled: false
      };

      const normalized = globalThis.ZeusSettings.normalizeSettings(raw);
      expect(normalized.commandPaletteEnabled).toBe(false);
      expect(normalized.commandPaletteShortcut).toBe('Cmd+Shift+P');
      expect(normalized.keyboardShortcutsEnabled).toBe(false);

      const serialized = globalThis.ZeusSettings.serializeSettings(normalized);
      expect(serialized.commandPaletteEnabled).toBe(false);
      expect(serialized.commandPaletteShortcut).toBe('Cmd+Shift+P');
      expect(serialized.keyboardShortcutsEnabled).toBe(false);
    });
  });
});
