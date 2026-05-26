const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('tutorial overlay positions target frame, restores navigation focus, and blocks background clicks', () => {
  const { elements, sandbox, state } = loadTutorialController();

  assert.equal(sandbox.startTutorial('intro'), true);

  assert.equal(elements.get('tutorialOverlay').hidden, false);
  assert.equal(elements.get('tutorialCoachProgress').textContent, 'Step 1 of 2');
  assert.equal(elements.get('tutorialTargetFrame').hidden, false);
  assert.equal(elements.get('tutorialOverlay').classList.contains('is-coach-only'), false);
  assert.equal(elements.get('tutorialTargetFrame').style.left, '94px');
  assert.equal(elements.get('tutorialTargetFrame').style.top, '114px');
  assert.equal(elements.get('tutorialCoach').style.left, '16px');
  assert.equal(elements.get('tutorialCoach').style.top, '16px');
  assert.equal(state.focused.at(-1), 'nextTutorialStepButton');
  assert.equal(state.documentListeners.some((listener) => listener.type === 'click'), true);

  const outsideEvent = eventFor(elements.get('backgroundButton'), 'click');
  sandbox.blockTutorialBackgroundInteraction(outsideEvent);
  assert.equal(outsideEvent.prevented, true);
  assert.equal(outsideEvent.stopped, true);

  const insideEvent = eventFor(elements.get('nextTutorialStepButton'), 'click');
  sandbox.blockTutorialBackgroundInteraction(insideEvent);
  assert.equal(insideEvent.prevented, false);
});

test('tutorial focus trap wraps coach focus and Escape cleans up overlay listeners', () => {
  const { elements, sandbox, state } = loadTutorialController();
  sandbox.startTutorial('intro');
  const previous = elements.get('previousTutorialStepButton');
  const next = elements.get('nextTutorialStepButton');
  previous.disabled = false;
  sandbox.document.activeElement = next;

  const tabEvent = eventFor(next, 'keydown', { key: 'Tab' });
  sandbox.blockTutorialBackgroundInteraction(tabEvent);
  assert.equal(tabEvent.prevented, true);
  assert.equal(state.focused.at(-1), 'previousTutorialStepButton');

  const focusOutside = eventFor(elements.get('backgroundButton'), 'focusin');
  sandbox.blockTutorialBackgroundInteraction(focusOutside);
  assert.equal(focusOutside.prevented, true);
  assert.equal(state.focused.at(-1), 'nextTutorialStepButton');

  const escapeEvent = eventFor(elements.get('backgroundButton'), 'keydown', { key: 'Escape' });
  sandbox.blockTutorialBackgroundInteraction(escapeEvent);
  assert.equal(elements.get('tutorialOverlay').hidden, true);
  assert.equal(elements.get('tutorialTargetFrame').hidden, true);
  assert.equal(elements.get('tutorialOverlay').classList.contains('is-coach-only'), false);
  assert.equal(state.windowRemoved.some((listener) => listener.type === 'resize'), true);
  assert.equal(state.documentRemoved.some((listener) => listener.type === 'click'), true);
  assert.equal(state.statuses.at(-1), 'Tutorial ended.');
});

test('coach-only tutorial setup closes active modal surfaces', () => {
  const { sandbox, state } = loadTutorialController();
  sandbox.state.activeModalId = 'settingsModal';
  sandbox.state.activeModalCancelValue = 'cancel';
  sandbox.tutorialEnsureCoachOnlyStep();

  assert.deepEqual(JSON.parse(JSON.stringify(state.resolvedModals)), [{
    value: 'cancel',
    options: { flushNotifications: false }
  }]);
});

test('selector-less tutorial steps dim the background without a target frame', () => {
  const { elements, sandbox } = loadTutorialController();

  sandbox.startTutorial('intro');
  sandbox.nextTutorialStep();

  assert.equal(elements.get('tutorialOverlay').hidden, false);
  assert.equal(elements.get('tutorialTargetFrame').hidden, true);
  assert.equal(elements.get('tutorialOverlay').classList.contains('is-coach-only'), true);
});

function loadTutorialController() {
  const state = {
    documentListeners: [],
    documentRemoved: [],
    focused: [],
    resolvedModals: [],
    statuses: [],
    windowListeners: [],
    windowRemoved: []
  };
  const elements = createTutorialElements(state);
  const document = {
    activeElement: null,
    body: new FakeElement('body', state),
    documentElement: new FakeElement('html', state),
    addEventListener: (type, listener, options) => state.documentListeners.push({ type, listener, options }),
    removeEventListener: (type, listener, options) => state.documentRemoved.push({ type, listener, options }),
    querySelector: (selector) => selector === '#target' ? elements.get('target') : null
  };
  const sandbox = {
    $: (id) => elements.get(id) || null,
    HTMLElement: FakeElement,
    TUTORIALS: [{
      id: 'intro',
      title: 'Intro',
      level: 'Beginner',
      duration: '2 min',
      summary: 'Walkthrough',
      steps: [
        { title: 'Target', body: 'Look here', selector: '#target', coachPlacement: 'top-left' },
        { title: 'Finish', body: 'Done' }
      ]
    }],
    activeTutorialId: '',
    activeTutorialStepIndex: 0,
    closeCaptureSettingsPanels() {},
    closeToolbarMenus() {},
    document,
    requestAnimationFrame: (callback) => callback(),
    selectedTutorialId: 'intro',
    setStatus: (message) => state.statuses.push(message),
    state: { activeModalId: '', activeModalCancelValue: null },
    tutorialFloatingUiPending: false,
    tutorialOverlayPositionHandler: null,
    tutorialOwnedModalId: '',
    tutorialPreferredNavigationFocusId: 'nextTutorialStepButton',
    window: {
      innerHeight: 600,
      innerWidth: 800,
      addEventListener: (type, listener, options) => state.windowListeners.push({ type, listener, options }),
      getComputedStyle: () => ({ overflow: 'visible', overflowX: 'visible', overflowY: 'visible', position: 'static' }),
      removeEventListener: (type, listener, options) => state.windowRemoved.push({ type, listener, options })
    }
  };
  for (const name of [
    'closeContextMenu',
    'closeFileSourceMenu',
    'resolveActiveModal'
  ]) {
    sandbox[name] = name === 'resolveActiveModal'
      ? (value, options) => state.resolvedModals.push({ value, options })
      : () => {};
  }
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/features/tutorialController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  sandbox.document = document;
  return { elements, sandbox, state };
}

function createTutorialElements(state) {
  const elements = new Map([
    ['tutorialOverlay', new FakeElement('div', state)],
    ['tutorialTargetFrame', new FakeElement('div', state, { left: 0, top: 0, width: 0, height: 0 })],
    ['tutorialCoach', new FakeElement('section', state, { left: 0, top: 0, width: 260, height: 160 })],
    ['tutorialCoachProgress', new FakeElement('div', state)],
    ['tutorialCoachTitle', new FakeElement('h2', state)],
    ['tutorialCoachBody', new FakeElement('p', state)],
    ['tutorialCoachHint', new FakeElement('p', state)],
    ['previousTutorialStepButton', new FakeElement('button', state)],
    ['nextTutorialStepButton', new FakeElement('button', state)],
    ['target', new FakeElement('button', state, { left: 100, top: 120, width: 80, height: 30 })],
    ['backgroundButton', new FakeElement('button', state)]
  ]);
  elements.get('tutorialCoach').querySelectorAll = () => [
    elements.get('previousTutorialStepButton'),
    elements.get('nextTutorialStepButton')
  ];
  elements.get('previousTutorialStepButton').id = 'previousTutorialStepButton';
  elements.get('nextTutorialStepButton').id = 'nextTutorialStepButton';
  elements.get('target').id = 'target';
  elements.get('backgroundButton').id = 'backgroundButton';
  elements.get('tutorialCoach').append(
    elements.get('previousTutorialStepButton'),
    elements.get('nextTutorialStepButton')
  );
  return elements;
}

function eventFor(target, type, fields = {}) {
  return {
    key: '',
    prevented: false,
    shiftKey: false,
    stopped: false,
    target,
    type,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    ...fields
  };
}

class FakeElement {
  constructor(tagName = 'div', state = null, rect = { left: 0, top: 0, width: 24, height: 24 }) {
    this.children = [];
    this.disabled = false;
    this.hidden = false;
    this.id = '';
    this.classList = new FakeClassList();
    this.offsetParent = {};
    this.parentElement = null;
    this.rect = {
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height
    };
    this.state = state;
    this.style = {};
    this.tagName = tagName.toUpperCase();
    this.textContent = '';
  }

  append(...children) {
    for (const child of children.flat()) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  contains(target) {
    return target === this || this.children.some((child) => child === target || child.contains?.(target));
  }

  focus() {
    this.state?.focused.push(this.id || this.tagName.toLowerCase());
  }

  getBoundingClientRect() {
    return this.rect;
  }

  querySelectorAll() {
    return this.children;
  }

  scrollIntoView() {}
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  contains(value) {
    return this.values.has(value);
  }

  remove(value) {
    this.values.delete(value);
  }
}
