(function attachKeyboardShortcuts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PostMeterKeyboardShortcuts = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, () => {
  const KEYBOARD_SHORTCUT_ACTIONS = Object.freeze([
    { id: 'settings', label: 'Open Settings', defaultShortcut: 'CmdOrCtrl+,', group: 'Application' },
    { id: 'quit', label: 'Quit PostMeter', defaultShortcut: 'CmdOrCtrl+Q', group: 'Application' },
    { id: 'new-request', label: 'New Request', defaultShortcut: 'CmdOrCtrl+N', group: 'File' },
    { id: 'new-collection', label: 'New Collection', defaultShortcut: 'CmdOrCtrl+Shift+N', group: 'File' },
    { id: 'new-folder', label: 'New Folder', defaultShortcut: 'CmdOrCtrl+Alt+N', group: 'File' },
    { id: 'new-environment', label: 'New Environment', defaultShortcut: 'CmdOrCtrl+E', group: 'File' },
    { id: 'new-runner', label: 'New Runner', defaultShortcut: 'CmdOrCtrl+T', group: 'File' },
    { id: 'new-performance-test', label: 'New Performance Test', defaultShortcut: 'CmdOrCtrl+P', group: 'File' },
    { id: 'new-workspace', label: 'New Workspace', defaultShortcut: 'CmdOrCtrl+W', group: 'File' },
    { id: 'save-active-tab', label: 'Save Active Tab', defaultShortcut: 'CmdOrCtrl+S', group: 'File' },
    { id: 'import-request', label: 'Import Request', defaultShortcut: '', group: 'File' },
    { id: 'import-collection', label: 'Import Collection', defaultShortcut: '', group: 'File' },
    { id: 'import-environment', label: 'Import Environment', defaultShortcut: '', group: 'File' },
    { id: 'import-runner', label: 'Import Runner', defaultShortcut: '', group: 'File' },
    { id: 'import-performance-test', label: 'Import Performance Test', defaultShortcut: '', group: 'File' },
    { id: 'import-workspace', label: 'Import Workspace', defaultShortcut: '', group: 'File' },
    { id: 'export-request', label: 'Export Request as PostMeter', defaultShortcut: '', group: 'File' },
    { id: 'export-request-curl', label: 'Export Request as curl', defaultShortcut: '', group: 'File' },
    { id: 'export-collection', label: 'Export Collection as PostMeter', defaultShortcut: '', group: 'File' },
    { id: 'export-postman', label: 'Export Collection as Postman', defaultShortcut: '', group: 'File' },
    { id: 'export-openapi', label: 'Export Collection as OpenAPI', defaultShortcut: '', group: 'File' },
    { id: 'export-curl', label: 'Export Collection as curl', defaultShortcut: '', group: 'File' },
    { id: 'export-environment', label: 'Export Environment as PostMeter', defaultShortcut: '', group: 'File' },
    { id: 'export-postman-environment', label: 'Export Environment as Postman', defaultShortcut: '', group: 'File' },
    { id: 'export-runner-definition', label: 'Export Runner', defaultShortcut: '', group: 'File' },
    { id: 'export-performance-test', label: 'Export Performance Test', defaultShortcut: '', group: 'File' },
    { id: 'export-workspace', label: 'Export Workspace', defaultShortcut: '', group: 'File' },
    { id: 'undo', label: 'Undo', defaultShortcut: 'CmdOrCtrl+Z', group: 'Edit' },
    { id: 'redo', label: 'Redo', defaultShortcut: 'CmdOrCtrl+Shift+Z', group: 'Edit' },
    { id: 'cut', label: 'Cut', defaultShortcut: 'CmdOrCtrl+X', group: 'Edit' },
    { id: 'copy', label: 'Copy', defaultShortcut: 'CmdOrCtrl+C', group: 'Edit' },
    { id: 'paste', label: 'Paste', defaultShortcut: 'CmdOrCtrl+V', group: 'Edit' },
    { id: 'paste-and-match-style', label: 'Paste and Match Style', defaultShortcut: 'CmdOrCtrl+Shift+V', group: 'Edit' },
    { id: 'delete', label: 'Delete', defaultShortcut: 'Delete', group: 'Edit' },
    { id: 'select-all', label: 'Select All', defaultShortcut: 'CmdOrCtrl+A', group: 'Edit' },
    { id: 'reload', label: 'Reload', defaultShortcut: 'CmdOrCtrl+R', group: 'View' },
    { id: 'force-reload', label: 'Force Reload', defaultShortcut: 'CmdOrCtrl+Shift+R', group: 'View' },
    { id: 'toggle-devtools', label: 'Toggle Developer Tools', defaultShortcut: 'CmdOrCtrl+Shift+I', group: 'View' },
    { id: 'zoom-in', label: 'Zoom In', defaultShortcut: 'CmdOrCtrl+Plus', group: 'View' },
    { id: 'zoom-out', label: 'Zoom Out', defaultShortcut: 'CmdOrCtrl+Minus', group: 'View' },
    { id: 'zoom-reset', label: 'Reset Zoom', defaultShortcut: 'CmdOrCtrl+0', group: 'View' },
    { id: 'toggle-fullscreen', label: 'Toggle Full Screen', defaultShortcut: 'F11', group: 'View' }
  ]);

  const KEYBOARD_SHORTCUT_ACTION_IDS = Object.freeze(KEYBOARD_SHORTCUT_ACTIONS.map((action) => action.id));
  const DEFAULT_KEYBOARD_SHORTCUTS = Object.freeze(Object.fromEntries(
    KEYBOARD_SHORTCUT_ACTIONS.map((action) => [action.id, action.defaultShortcut])
  ));
  const SHORTCUT_ACTION_BY_ID = Object.freeze(Object.fromEntries(
    KEYBOARD_SHORTCUT_ACTIONS.map((action) => [action.id, action])
  ));

  const MODIFIER_ORDER = ['CmdOrCtrl', 'Ctrl', 'Cmd', 'Alt', 'Shift'];
  const MODIFIER_ALIASES = new Map([
    ['cmdorctrl', 'CmdOrCtrl'],
    ['commandorcontrol', 'CmdOrCtrl'],
    ['commandorctrl', 'CmdOrCtrl'],
    ['ctrlorcmd', 'CmdOrCtrl'],
    ['ctrlorcommand', 'CmdOrCtrl'],
    ['controlorcommand', 'CmdOrCtrl'],
    ['ctrl', 'Ctrl'],
    ['control', 'Ctrl'],
    ['cmd', 'Cmd'],
    ['command', 'Cmd'],
    ['meta', 'Cmd'],
    ['super', 'Cmd'],
    ['alt', 'Alt'],
    ['option', 'Alt'],
    ['shift', 'Shift']
  ]);
  const KEY_ALIASES = new Map([
    ['+', 'Plus'],
    ['plus', 'Plus'],
    ['add', 'Plus'],
    ['numpadadd', 'Plus'],
    ['=', 'Plus'],
    ['equal', 'Plus'],
    ['-', 'Minus'],
    ['minus', 'Minus'],
    ['subtract', 'Minus'],
    ['numpadsubtract', 'Minus'],
    [',', ','],
    ['comma', ','],
    ['.', '.'],
    ['period', '.'],
    ['/', '/'],
    ['slash', '/'],
    ['\\', '\\'],
    ['backslash', '\\'],
    [';', ';'],
    ['semicolon', ';'],
    ["'", "'"],
    ['quote', "'"],
    ['`', '`'],
    ['backquote', '`'],
    ['space', 'Space'],
    ['spacebar', 'Space'],
    ['esc', 'Esc'],
    ['escape', 'Esc'],
    ['enter', 'Enter'],
    ['return', 'Enter'],
    ['tab', 'Tab'],
    ['backspace', 'Backspace'],
    ['delete', 'Delete'],
    ['del', 'Delete'],
    ['insert', 'Insert'],
    ['home', 'Home'],
    ['end', 'End'],
    ['pageup', 'PageUp'],
    ['pagedown', 'PageDown'],
    ['up', 'Up'],
    ['arrowup', 'Up'],
    ['down', 'Down'],
    ['arrowdown', 'Down'],
    ['left', 'Left'],
    ['arrowleft', 'Left'],
    ['right', 'Right'],
    ['arrowright', 'Right']
  ]);

  for (let index = 0; index <= 9; index += 1) {
    KEY_ALIASES.set(String(index), String(index));
    KEY_ALIASES.set(`digit${index}`, String(index));
    KEY_ALIASES.set(`numpad${index}`, String(index));
  }
  for (let index = 1; index <= 24; index += 1) {
    KEY_ALIASES.set(`f${index}`, `F${index}`);
  }

  function normalizeKeyboardShortcuts(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const output = {};
    for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
      output[action.id] = Object.hasOwn(source, action.id)
        ? normalizeShortcutText(source[action.id], '')
        : normalizeShortcutText(action.defaultShortcut);
    }
    return output;
  }

  function normalizeShortcutText(value, fallback = '') {
    const source = value == null ? '' : String(value).trim();
    if (!source) {
      return fallback === '' ? '' : normalizeShortcutText(fallback, '');
    }
    const tokens = shortcutTokens(source);
    const modifiers = new Set();
    let key = '';
    for (const token of tokens) {
      const normalizedToken = token.toLowerCase().replace(/\s+/g, '');
      const modifier = MODIFIER_ALIASES.get(normalizedToken);
      if (modifier) {
        modifiers.add(modifier);
        continue;
      }
      const normalizedKey = normalizeKeyToken(token);
      if (normalizedKey) {
        key = normalizedKey;
      }
    }
    if (!key) {
      return fallback === '' ? '' : normalizeShortcutText(fallback, '');
    }
    if (modifiers.has('CmdOrCtrl')) {
      modifiers.delete('Ctrl');
      modifiers.delete('Cmd');
    }
    const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
    return [...orderedModifiers, key].join('+');
  }

  function shortcutTokens(value) {
    let text = String(value || '').trim();
    if (text === '+') {
      return ['Plus'];
    }
    if (/\+\+$/.test(text)) {
      text = `${text.slice(0, -1)}Plus`;
    }
    return text
      .split('+')
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function normalizeKeyToken(token) {
    const raw = String(token || '').trim();
    if (!raw) {
      return '';
    }
    const compact = raw.toLowerCase().replace(/\s+/g, '');
    if (KEY_ALIASES.has(compact)) {
      return KEY_ALIASES.get(compact);
    }
    if (/^[a-z]$/i.test(raw)) {
      return raw.toUpperCase();
    }
    if (/^key[a-z]$/i.test(raw)) {
      return raw.slice(3).toUpperCase();
    }
    return '';
  }

  function recordShortcutFromEvent(event = {}) {
    const key = keyForInput(event);
    if (!key || isModifierKey(key)) {
      return '';
    }
    const modifiers = new Set();
    if (event.ctrlKey || event.control || event.metaKey || event.meta) {
      modifiers.add('CmdOrCtrl');
    }
    if (event.altKey || event.alt) {
      modifiers.add('Alt');
    }
    if ((event.shiftKey || event.shift) && !(key === 'Plus' && isShiftProducedPlus(event))) {
      modifiers.add('Shift');
    }
    return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+');
  }

  function isShiftProducedPlus(event = {}) {
    const code = String(event.code || '');
    return code === 'Equal' || code === 'NumpadAdd' || String(event.key || '') === '+';
  }

  function isModifierKey(key) {
    return ['Control', 'Ctrl', 'Shift', 'Alt', 'Meta', 'Cmd', 'Command', 'CmdOrCtrl'].includes(key);
  }

  function eventMatchesShortcut(event = {}, shortcut, platform = currentPlatform()) {
    const normalized = normalizeShortcutText(shortcut);
    if (!normalized) {
      return false;
    }
    const parsed = parseShortcut(normalized);
    if (!parsed.key) {
      return false;
    }
    if (!modifiersMatch(event, parsed.modifiers, parsed.key, platform)) {
      return false;
    }
    return keyForInput(event) === parsed.key;
  }

  function isNumpadEquivalentShortcutEvent(event = {}, shortcut, platform = currentPlatform()) {
    return isNumpadInput(event) && eventMatchesShortcut(event, shortcut, platform);
  }

  function isNumpadInput(event = {}) {
    return String(event.code || '').startsWith('Numpad');
  }

  function parseShortcut(shortcut) {
    const tokens = shortcutTokens(normalizeShortcutText(shortcut));
    const modifiers = new Set();
    let key = '';
    for (const token of tokens) {
      const modifier = MODIFIER_ALIASES.get(token.toLowerCase());
      if (modifier) {
        modifiers.add(modifier);
      } else {
        key = normalizeKeyToken(token);
      }
    }
    return { key, modifiers };
  }

  function modifiersMatch(event, modifiers, shortcutKey, platform) {
    const wantsCmdOrCtrl = modifiers.has('CmdOrCtrl');
    const wantsCtrl = modifiers.has('Ctrl') || (wantsCmdOrCtrl && platform !== 'darwin');
    const wantsMeta = modifiers.has('Cmd') || (wantsCmdOrCtrl && platform === 'darwin');
    const wantsAlt = modifiers.has('Alt');
    const wantsShift = modifiers.has('Shift');
    const inputCtrl = event.ctrlKey === true || event.control === true;
    const inputMeta = event.metaKey === true || event.meta === true;
    const inputAlt = event.altKey === true || event.alt === true;
    const inputShift = event.shiftKey === true || event.shift === true;
    if (inputCtrl !== wantsCtrl) {
      return false;
    }
    if (inputMeta !== wantsMeta) {
      return false;
    }
    if (inputAlt !== wantsAlt) {
      return false;
    }
    if (inputShift !== wantsShift) {
      return shortcutKey === 'Plus' && inputShift && !wantsShift && isShiftProducedPlus(event);
    }
    return true;
  }

  function keyForInput(input = {}) {
    const code = String(input.code || '');
    if (code.startsWith('Numpad')) {
      return normalizeKeyToken(code);
    }
    const key = String(input.key || '');
    if (key === '+') {
      return 'Plus';
    }
    if (key === '-') {
      return 'Minus';
    }
    const normalizedKey = normalizeKeyToken(key);
    if (normalizedKey) {
      return normalizedKey;
    }
    return normalizeKeyToken(code);
  }

  function shortcutActionById(actionId) {
    return SHORTCUT_ACTION_BY_ID[actionId] || null;
  }

  function shortcutForAction(shortcuts, actionId) {
    const normalized = normalizeKeyboardShortcuts(shortcuts);
    return normalized[actionId] || '';
  }

  function formatShortcutForDisplay(value) {
    return normalizeShortcutText(value).replace(/\bCmdOrCtrl\b/g, 'Ctrl');
  }

  function currentPlatform() {
    if (typeof process === 'object' && process?.platform) {
      return process.platform;
    }
    return 'linux';
  }

  return {
    DEFAULT_KEYBOARD_SHORTCUTS,
    KEYBOARD_SHORTCUT_ACTIONS,
    KEYBOARD_SHORTCUT_ACTION_IDS,
    eventMatchesShortcut,
    formatShortcutForDisplay,
    isNumpadEquivalentShortcutEvent,
    keyForInput,
    normalizeKeyboardShortcuts,
    normalizeShortcutText,
    recordShortcutFromEvent,
    shortcutActionById,
    shortcutForAction
  };
});
