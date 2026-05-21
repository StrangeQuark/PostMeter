const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

test('modal controller stacks allowed child modals, restores focus, and resolves parent state', async () => {
  const { backdrop, document, elements, sandbox, state } = loadModalController();
  document.activeElement = elements.get('opener');

  const parentPromise = sandbox.showModal('settingsModal', 'parent-cancel');
  assert.equal(state.activeModalId, 'settingsModal');
  assert.equal(backdrop.hidden, false);
  assert.equal(elements.get('settingsModal').hidden, false);

  const childPromise = sandbox.showModal('clientCertificateModal', 'child-cancel');
  assert.equal(state.activeModalId, 'clientCertificateModal');
  assert.equal(backdrop.classList.contains('is-stacked'), true);
  assert.equal(elements.get('settingsModal').classList.contains('is-stack-parent'), true);
  assert.equal(elements.get('clientCertificateModal').classList.contains('is-stack-top'), true);

  sandbox.resolveActiveModal('child-value');
  assert.equal(await childPromise, 'child-value');
  assert.equal(state.activeModalId, 'settingsModal');
  assert.equal(elements.get('settingsModal').hidden, false);
  assert.equal(elements.get('clientCertificateModal').hidden, true);

  sandbox.resolveActiveModal('parent-value');
  assert.equal(await parentPromise, 'parent-value');
  assert.equal(state.activeModalId, '');
  assert.equal(backdrop.hidden, true);
  assert.equal(document.activeElement, elements.get('opener'));
  assert.equal(state.flushCount, 2);
});

test('modal controller cancels non-stackable modals and exposes stack policy', async () => {
  const { sandbox, state } = loadModalController();
  const firstPromise = sandbox.showModal('requestExportModal', 'first-cancel');
  const secondPromise = sandbox.showModal('notificationModal', 'second-cancel');

  assert.equal(await firstPromise, 'first-cancel');
  assert.equal(state.activeModalId, 'notificationModal');
  sandbox.cancelActiveModal();
  assert.equal(await secondPromise, 'second-cancel');
  assert.equal(sandbox.shouldStackModal('settingsModal', 'filePickerModal'), true);
  assert.equal(sandbox.shouldStackModal('clientCertificateModal', 'filePickerModal'), true);
  assert.equal(sandbox.shouldStackModal('cookiesModal', 'confirmActionModal'), true);
  assert.equal(sandbox.shouldStackModal('requestExportModal', 'notificationModal'), false);
});

function loadModalController() {
  const elements = new Map([
    ['modalBackdrop', new FakeElement('div')],
    ['opener', new FakeElement('button')],
    ['settingsModal', new FakeElement('section')],
    ['clientCertificateModal', new FakeElement('section')],
    ['requestExportModal', new FakeElement('section')],
    ['notificationModal', new FakeElement('section')]
  ]);
  const modals = ['settingsModal', 'clientCertificateModal', 'requestExportModal', 'notificationModal']
    .map((id) => {
      const modal = elements.get(id);
      modal.id = id;
      modal.hidden = true;
      modal.classList.add('modal');
      return modal;
    });
  const backdrop = elements.get('modalBackdrop');
  backdrop.querySelectorAll = (selector) => selector === '.modal' ? modals : [];
  const document = { activeElement: null };
  const state = { activeModalCancelValue: null, activeModalId: '', activeModalResolver: null, flushCount: 0 };
  const sandbox = {
    HTMLElement: FakeElement,
    closeContextMenu() {},
    closeFileSourceMenu() {},
    closeToolbarMenus() {},
    document,
    flushNotificationModalQueue: async () => { state.flushCount += 1; },
    focusInitialModalElement(modalId) {
      elements.get(modalId)?.focus();
    },
    isRestorableFocusTarget: (target) => Boolean(target && target.disabled !== true && target.hidden !== true),
    lastModalFocusTarget: null,
    modalRestoreFocusTarget: (target) => target || null,
    modalStack: [],
    notifyUser() {},
    openModalState(targetState, modalId, resolver, cancelValue) {
      targetState.activeModalId = modalId;
      targetState.activeModalResolver = resolver;
      targetState.activeModalCancelValue = cancelValue;
    },
    openTutorialsModal: async () => null,
    resolveModalState(targetState) {
      const resolver = targetState.activeModalResolver;
      targetState.activeModalId = '';
      targetState.activeModalResolver = null;
      targetState.activeModalCancelValue = null;
      return resolver;
    },
    restoreModalFocus() {
      elements.get('opener').focus();
    },
    selectedTutorialId: '',
    setKeyboardShortcutCaptureMode() {},
    setStatus() {},
    state,
    tutorialById: () => true,
    $: (id) => elements.get(id) || null
  };
  for (const element of elements.values()) {
    element.ownerDocument = document;
  }
  const sourcePath = path.join(PROJECT_ROOT, 'src/renderer/ui/modalController.js');
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  return { backdrop, document, elements, sandbox, state };
}

class FakeElement {
  constructor(tagName = 'div') {
    this.className = '';
    this.disabled = false;
    this.hidden = false;
    this.id = '';
    this.ownerDocument = null;
    this.tagName = tagName.toUpperCase();
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = [...classes].join(' ');
      },
      remove: (...names) => {
        const remove = new Set(names);
        this.className = this.className.split(/\s+/).filter((name) => !remove.has(name)).join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force == null ? !classes.has(name) : force === true;
        if (enabled) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
        this.className = [...classes].join(' ');
      }
    };
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }
}
