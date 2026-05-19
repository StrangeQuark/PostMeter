const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_KEYBOARD_SHORTCUTS,
  eventMatchesShortcut,
  formatShortcutForDisplay,
  isNumpadEquivalentShortcutEvent,
  KEYBOARD_SHORTCUT_ACTIONS,
  normalizeKeyboardShortcuts,
  normalizeShortcutText,
  recordShortcutFromEvent,
  shortcutForAction
} = require('../../src/core/keyboardShortcuts');

test('keyboard shortcut normalization canonicalizes editable shortcut text', () => {
  assert.equal(normalizeShortcutText('Ctrl++'), 'Ctrl+Plus');
  assert.equal(normalizeShortcutText('CmdOrCtrl+='), 'CmdOrCtrl+Plus');
  assert.equal(normalizeShortcutText('CmdOrCtrl+Numpad1'), 'CmdOrCtrl+1');
  assert.equal(normalizeShortcutText('control + alt + numpadsubtract'), 'Ctrl+Alt+Minus');
  assert.equal(normalizeShortcutText('', 'CmdOrCtrl+N'), 'CmdOrCtrl+N');
});

test('keyboard shortcut display text uses Ctrl instead of CmdOrCtrl', () => {
  assert.equal(formatShortcutForDisplay('CmdOrCtrl+N'), 'Ctrl+N');
  assert.equal(formatShortcutForDisplay('CmdOrCtrl+Shift+N'), 'Ctrl+Shift+N');
  assert.equal(formatShortcutForDisplay('CmdOrCtrl+Plus'), 'Ctrl+Plus');
  assert.equal(formatShortcutForDisplay('Ctrl+Alt+N'), 'Ctrl+Alt+N');
});

test('keyboard shortcut settings merge defaults with customized values', () => {
  const shortcuts = normalizeKeyboardShortcuts({
    'new-request': 'CmdOrCtrl+1',
    'new-environment': '',
    'zoom-in': 'CmdOrCtrl+=',
    unknown: 'CmdOrCtrl+X'
  });

  assert.equal(shortcuts['new-request'], 'CmdOrCtrl+1');
  assert.equal(shortcuts['new-environment'], '');
  assert.equal(shortcuts['zoom-in'], 'CmdOrCtrl+Plus');
  assert.equal(shortcuts['save-active-tab'], DEFAULT_KEYBOARD_SHORTCUTS['save-active-tab']);
  assert.equal(Object.hasOwn(shortcuts, 'unknown'), false);
  assert.equal(shortcutForAction(shortcuts, 'zoom-in'), 'CmdOrCtrl+Plus');
});

test('keyboard shortcut defaults include creation shortcuts for primary panes', () => {
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS['new-environment'], 'CmdOrCtrl+E');
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS['new-runner'], 'CmdOrCtrl+T');
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS['new-performance-test'], 'CmdOrCtrl+P');
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS['new-workspace'], 'CmdOrCtrl+W');

  const shortcuts = normalizeKeyboardShortcuts();
  assert.equal(shortcutForAction(shortcuts, 'new-environment'), 'CmdOrCtrl+E');
  assert.equal(shortcutForAction(shortcuts, 'new-runner'), 'CmdOrCtrl+T');
  assert.equal(shortcutForAction(shortcuts, 'new-performance-test'), 'CmdOrCtrl+P');
  assert.equal(shortcutForAction(shortcuts, 'new-workspace'), 'CmdOrCtrl+W');
});

test('keyboard shortcut settings group application controls first', () => {
  assert.equal(KEYBOARD_SHORTCUT_ACTIONS[0].group, 'Application');
  assert.equal(KEYBOARD_SHORTCUT_ACTIONS[0].id, 'settings');
  assert.equal(KEYBOARD_SHORTCUT_ACTIONS[1].id, 'quit');
});

test('keyboard shortcut defaults include configurable File and Edit menu controls', () => {
  const shortcuts = normalizeKeyboardShortcuts();

  assert.equal(shortcutForAction(shortcuts, 'quit'), 'CmdOrCtrl+Q');
  assert.equal(shortcutForAction(shortcuts, 'save-active-tab'), 'CmdOrCtrl+S');
  assert.equal(shortcutForAction(shortcuts, 'import-request'), '');
  assert.equal(shortcutForAction(shortcuts, 'export-workspace'), '');
  assert.equal(shortcutForAction(shortcuts, 'undo'), 'CmdOrCtrl+Z');
  assert.equal(shortcutForAction(shortcuts, 'redo'), 'CmdOrCtrl+Shift+Z');
  assert.equal(shortcutForAction(shortcuts, 'cut'), 'CmdOrCtrl+X');
  assert.equal(shortcutForAction(shortcuts, 'copy'), 'CmdOrCtrl+C');
  assert.equal(shortcutForAction(shortcuts, 'paste'), 'CmdOrCtrl+V');
  assert.equal(shortcutForAction(shortcuts, 'paste-and-match-style'), 'CmdOrCtrl+Shift+V');
  assert.equal(shortcutForAction(shortcuts, 'delete'), 'Delete');
  assert.equal(shortcutForAction(shortcuts, 'select-all'), 'CmdOrCtrl+A');
});

test('keyboard shortcut defaults include configurable View menu controls', () => {
  const shortcuts = normalizeKeyboardShortcuts();

  assert.equal(shortcutForAction(shortcuts, 'reload'), 'CmdOrCtrl+R');
  assert.equal(shortcutForAction(shortcuts, 'force-reload'), 'CmdOrCtrl+Shift+R');
  assert.equal(shortcutForAction(shortcuts, 'toggle-devtools'), 'CmdOrCtrl+Shift+I');
  assert.equal(shortcutForAction(shortcuts, 'zoom-reset'), 'CmdOrCtrl+0');
  assert.equal(shortcutForAction(shortcuts, 'zoom-in'), 'CmdOrCtrl+Plus');
  assert.equal(shortcutForAction(shortcuts, 'zoom-out'), 'CmdOrCtrl+Minus');
  assert.equal(shortcutForAction(shortcuts, 'toggle-fullscreen'), 'F11');
});

test('keyboard shortcut recorder treats numpad keys as their normal key equivalents', () => {
  assert.equal(recordShortcutFromEvent({ ctrlKey: true, code: 'Numpad1', key: '1' }), 'CmdOrCtrl+1');
  assert.equal(recordShortcutFromEvent({ ctrlKey: true, code: 'NumpadAdd', key: '+' }), 'CmdOrCtrl+Plus');
  assert.equal(recordShortcutFromEvent({ ctrlKey: true, code: 'NumpadSubtract', key: '-' }), 'CmdOrCtrl+Minus');
  assert.equal(recordShortcutFromEvent({ ctrlKey: true, shiftKey: true, code: 'Equal', key: '+' }), 'CmdOrCtrl+Plus');
});

test('keyboard shortcut matcher supports normal number row and numpad equivalents', () => {
  assert.equal(eventMatchesShortcut({ control: true, code: 'Digit1', key: '1' }, 'CmdOrCtrl+1', 'linux'), true);
  assert.equal(eventMatchesShortcut({ control: true, code: 'Numpad1', key: '1' }, 'CmdOrCtrl+1', 'linux'), true);
  assert.equal(eventMatchesShortcut({ control: true, shift: true, code: 'Equal', key: '+' }, 'CmdOrCtrl+Plus', 'linux'), true);
  assert.equal(eventMatchesShortcut({ control: true, code: 'NumpadAdd', key: '+' }, 'CmdOrCtrl+Plus', 'linux'), true);
  assert.equal(eventMatchesShortcut({ control: true, code: 'Minus', key: '-' }, 'CmdOrCtrl+Minus', 'linux'), true);
  assert.equal(eventMatchesShortcut({ control: true, code: 'NumpadSubtract', key: '-' }, 'CmdOrCtrl+Minus', 'linux'), true);
  assert.equal(eventMatchesShortcut({ control: true, code: 'Digit0', key: '0' }, 'CmdOrCtrl+0', 'linux'), true);
  assert.equal(eventMatchesShortcut({ control: true, code: 'Numpad0', key: '0' }, 'CmdOrCtrl+0', 'linux'), true);
  assert.equal(eventMatchesShortcut({ code: 'Numpad1', key: '1' }, 'CmdOrCtrl+1', 'linux'), false);
});

test('numpad-equivalent detection only claims numpad inputs', () => {
  assert.equal(isNumpadEquivalentShortcutEvent({ control: true, code: 'Digit1', key: '1' }, 'CmdOrCtrl+1', 'linux'), false);
  assert.equal(isNumpadEquivalentShortcutEvent({ control: true, code: 'Numpad1', key: '1' }, 'CmdOrCtrl+1', 'linux'), true);
});
