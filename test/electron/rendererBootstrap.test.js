const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  bindUi,
  closeToolbarMenus,
  initializeRenderer
} = require('../../src/renderer/rendererBootstrap');
const { setContextMenuPeerCloser, showContextMenu } = require('../../src/renderer/contextMenu');

function selectOptionValues(source, id) {
  const match = source.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`));
  assert.ok(match, `Expected ${id} select to exist.`);
  return [...match[1].matchAll(/<option value="([^"]+)"/g)].map((optionMatch) => optionMatch[1]);
}

test('renderer bootstrap initializes theme and runs registered cleanup callbacks on unload', async () => {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const fakeDocument = {
    addEventListener(name, handler) {
      documentListeners.set(name, handler);
    }
  };
  const fakeWindow = {
    addEventListener(name, handler) {
      windowListeners.set(name, handler);
    }
  };
  const appliedThemes = [];
  let cleanupCount = 0;

  initializeRenderer({
    doc: fakeDocument,
    windowObject: fakeWindow,
    applyThemePreference: (theme) => appliedThemes.push(theme),
    getStoredThemePreference: () => 'dark',
    onReady: async ({ registerCleanup }) => {
      registerCleanup(() => { cleanupCount += 1; });
      registerCleanup(() => { cleanupCount += 10; });
    }
  });

  assert.deepEqual(appliedThemes, ['dark']);
  await documentListeners.get('DOMContentLoaded')();
  windowListeners.get('beforeunload')();
  assert.equal(cleanupCount, 11);
});

test('renderer bootstrap falls back to the system theme when theme loading throws', () => {
  const appliedThemes = [];
  initializeRenderer({
    doc: { addEventListener() {} },
    windowObject: { addEventListener() {} },
    applyThemePreference: (theme) => appliedThemes.push(theme),
    getStoredThemePreference() {
      throw new Error('storage unavailable');
    }
  });

  assert.deepEqual(appliedThemes, ['system']);
});

test('renderer bootstrap closes toolbar menus and resets trigger aria state', () => {
  const menus = [{ hidden: false }, { hidden: false }];
  const triggers = [
    {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
    },
    {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
    }
  ];

  closeToolbarMenus({
    querySelectorAll(selector) {
      if (selector === '.toolbar-menu') {
        return menus;
      }
      if (selector === '.menu-trigger') {
        return triggers;
      }
      return [];
    }
  });

  assert.equal(menus.every((menu) => menu.hidden === true), true);
  assert.equal(triggers.every((button) => button.attributes['aria-expanded'] === 'false'), true);
});

test('renderer accessibility source keeps splitters body editor and pane save recovery wired', async () => {
  const root = path.join(__dirname, '..', '..');
  const indexSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const themeSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'theme.css'), 'utf8');
  const chromeSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'chrome.css'), 'utf8');
  const editorPanelsSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'editorPanels.css'), 'utf8');
  const overlaysSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'overlays.css'), 'utf8');
  const layoutSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'layoutControls.js'), 'utf8');
  const bootstrapSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'rendererBootstrap.js'), 'utf8');
  const rendererSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');

  assert.match(indexSource, /id="bodyInput"[^>]+aria-label="Request body"/);
  assert.match(indexSource, /id="graphqlQueryInput"[^>]+aria-label="GraphQL query"/);
  assert.match(indexSource, /id="performanceGraphqlQueryInput"[^>]+aria-label="Performance GraphQL query"/);
  assert.match(indexSource, /id="exportItemModal"/);
  assert.match(indexSource, /id="exportItemList"[^>]+role="radiogroup"/);
  assert.match(indexSource, /id="confirmExportItemButton"[^>]+disabled/);
  assert.match(indexSource, /id="requestExportPickerModal"[^>]+runner-import-modal/);
  assert.match(indexSource, /id="requestExportPickerList"[^>]+runner-import-list/);
  assert.match(indexSource, /id="confirmRequestExportPickerButton"[^>]+disabled/);
  assert.match(indexSource, /id="folderDestinationModal"/);
  assert.match(indexSource, /id="folderDestinationList"[^>]+role="radiogroup"/);
  assert.match(indexSource, /id="confirmFolderDestinationButton"[^>]+disabled/);
  assert.match(indexSource, /id="csvVariablesModal"/);
  assert.match(indexSource, /id="runnerCsvVariablesButton"/);
  assert.match(indexSource, /id="runnerToggleCsvVariablesButton"/);
  assert.match(indexSource, /id="runnerEditCsvVariablesButton"/);
  assert.match(indexSource, /id="performanceCsvVariablesButton"/);
  assert.match(indexSource, /id="performanceToggleCsvVariablesButton"/);
  assert.match(indexSource, /id="performanceEditCsvVariablesButton"/);
  assert.doesNotMatch(indexSource, /id="fileMenuButton"/);
  assert.doesNotMatch(indexSource, /id="fileMenu"/);
  assert.match(indexSource, /id="settingsModal"[^>]+settings-modal/);
  assert.match(indexSource, /id="settingsAppearanceButton"[^>]+data-settings-section="appearance"/);
  assert.match(indexSource, /id="settingsModalsButton"[^>]+data-settings-section="modals"/);
  assert.match(indexSource, /id="themeDarkButton"[^>]+data-theme-option="dark"/);
  assert.match(indexSource, /id="interfaceFontSelect"/);
  assert.match(indexSource, /id="interfaceFontSelect"[\s\S]*value="system-mono"/);
  assert.match(indexSource, /id="interfaceFontSizeInput"[^>]+min="11"[^>]+max="18"/);
  assert.match(indexSource, /id="resetInterfaceTypographyButton"/);
  assert.match(indexSource, /id="editorFontSelect"/);
  assert.match(indexSource, /id="editorFontSelect"[\s\S]*value="georgia"/);
  assert.match(indexSource, /id="editorFontSizeInput"[^>]+min="11"[^>]+max="20"/);
  assert.match(indexSource, /id="resetEditorTypographyButton"/);
  assert.deepEqual(selectOptionValues(indexSource, 'interfaceFontSelect'), selectOptionValues(indexSource, 'editorFontSelect'));
  assert.match(indexSource, /id="showEditorLineNumbersInput"/);
  assert.match(indexSource, /src="vendor\/markdown-it\.min\.js"/);
  assert.match(indexSource, /src="markdownRenderer\.js"/);
  assert.match(indexSource, /id="docsPreview"[^>]+markdown-renderer/);
  assert.match(indexSource, /id="collectionDescriptionPreview"[^>]+markdown-renderer/);
  assert.match(indexSource, /id="saveOnForceCloseInput"/);
  assert.match(indexSource, /id="closeModalsOnBackdropClickInput"/);
  assert.match(indexSource, /id="includePrereleasesInput"/);
  assert.doesNotMatch(indexSource, /class="toolbar-group theme-control"/);
  assert.match(indexSource, /role="tablist"[^>]+aria-orientation="vertical"/);
  assert.match(layoutSource, /aria-valuemin/);
  assert.match(layoutSource, /aria-valuemax/);
  assert.match(layoutSource, /aria-valuenow/);
  assert.match(layoutSource, /sidebarMinimumWidthPixels/);
  assert.match(themeSource, /--sidebar-rail-width:\s*clamp\(102px,\s*calc\(var\(--ui-font-size\) \* 8\.2\),\s*156px\)/);
  assert.match(chromeSource, /grid-template-columns:\s*max\(var\(--sidebar-width\),\s*var\(--sidebar-min-width\)\)\s+6px\s+minmax\(0,\s*1fr\)/);
  assert.match(layoutSource, /event\.key === 'ArrowLeft'/);
  assert.match(layoutSource, /event\.key === 'ArrowRight'/);
  assert.match(bootstrapSource, /aria-orientation/);
  assert.match(bootstrapSource, /ArrowDown/);
  assert.match(bootstrapSource, /ArrowUp/);
  assert.match(bootstrapSource, /querySelectorAll\?\.\('\.toolbar-submenu-row'\)/);
  assert.match(bootstrapSource, /addEventListener\('mouseenter'/);
  assert.match(bootstrapSource, /activeRow !== submenuRow/);
  assert.match(bootstrapSource, /getSelectedExportItemId/);
  assert.match(bootstrapSource, /getSelectedFolderDestination/);
  assert.match(bootstrapSource, /onToggleRunnerCsvVariables/);
  assert.match(bootstrapSource, /onEditRunnerCsvVariables/);
  assert.match(bootstrapSource, /onTogglePerformanceCsvVariables/);
  assert.match(bootstrapSource, /onEditPerformanceCsvVariables/);
  assert.doesNotMatch(bootstrapSource, /'fileMenuButton', 'fileMenu'/);
  assert.doesNotMatch(bootstrapSource, /bindClick\(doc, 'openSettingsButton', options\.onOpenSettings\)/);
  assert.match(bootstrapSource, /data-settings-section/);
  assert.match(rendererSource, /async function newFolderFromToolbar/);
  assert.match(rendererSource, /async function openSettingsModal/);
  assert.match(rendererSource, /function selectSettingsSection/);
  assert.match(rendererSource, /function renderSettingsControls/);
  assert.match(rendererSource, /function renderFolderDestinationList/);
  assert.match(rendererSource, /function collectRequestExportEntries/);
  assert.match(rendererSource, /function renderRequestExportPickerList/);
  assert.match(rendererSource, /showModal\('requestExportPickerModal'/);
  assert.match(rendererSource, /postmeter\?\.clipboard\?\.writeText/);
  assert.match(rendererSource, /setContextMenuPeerCloser/);
  assert.match(rendererSource, /Request save failed:/);
  assert.match(rendererSource, /Request Save Failed/);
  assert.match(rendererSource, /Environment save failed:/);
  assert.match(rendererSource, /Environment Save Failed/);
  assert.match(rendererSource, /const previousSettings = structuredClone\(workspace\.settings\)/);
  assert.match(rendererSource, /workspace\.settings = previousSettings/);
  assert.match(indexSource, /<fieldset class="settings-card workspace-diagnostics-panel" aria-describedby="diagnosticsPrivacySummary">/);
  assert.doesNotMatch(indexSource, /diagnosticsSensitiveWarning/);
  for (const id of [
    'diagnosticLogUrlsInput',
    'diagnosticLogHeadersInput',
    'diagnosticLogCookiesInput',
    'diagnosticLogBodiesInput',
    'diagnosticLogProtocolMessagesInput',
    'diagnosticLogScriptConsoleInput',
    'diagnosticLogPayloadIdentifiersInput',
    'exportDiagnosticsButton'
  ]) {
    assert.doesNotMatch(indexSource, new RegExp(`id="${id}"[^>]+aria-describedby=`));
  }
  assert.match(chromeSource, /\.workspace-diagnostics-panel/);
  assert.match(chromeSource, /\.toolbar-group\s*\{[^}]*background:\s*transparent;/s);
  assert.match(chromeSource, /\.toolbar-group button\s*\{[^}]*min-height:\s*34px;[^}]*background:\s*var\(--surface-muted\);/s);
  assert.match(chromeSource, /\.toolbar-group button\.primary\s*\{[^}]*background:\s*var\(--primary\);/s);
  assert.match(chromeSource, /\.toolbar-menu:has\(\.toolbar-submenu-row:hover\) \.toolbar-submenu-row:not\(:hover\) \.toolbar-submenu/);
  assert.match(chromeSource, /\.toolbar-submenu::before/);
  assert.match(chromeSource, /\.request-tab-method\.method-post/);
  assert.match(chromeSource, /\.request-tab-method\.entity-collection/);
  assert.match(chromeSource, /\.request-tab-method\.entity-runner/);
  assert.match(chromeSource, /\.tree-badge\.entity-collection/);
  assert.match(chromeSource, /\.tree-badge\.entity-performance/);
  assert.doesNotMatch(overlaysSource, /--mono-font/);
  assert.match(overlaysSource, /csv-variables-modal textarea[\s\S]*font-family:\s*var\(--mono\)/);
  assert.match(overlaysSource, /csv-variables-modal textarea[\s\S]*font-size:\s*var\(--editor-font-size\)/);
  assert.doesNotMatch(editorPanelsSource, /--mono-font/);
  assert.match(editorPanelsSource, /\.code-editor\s*\{[\s\S]*font-family:\s*var\(--mono\)/);
  assert.match(editorPanelsSource, /\.code-editor\s*\{[\s\S]*font-size:\s*var\(--editor-font-size\)/);
  assert.doesNotMatch(editorPanelsSource, /\.field\s+span\s*\{/);
  assert.match(editorPanelsSource, /\.field\s*>\s*span\s*\{/);
  const codeEditorTokenCss = editorPanelsSource.slice(
    editorPanelsSource.indexOf('.code-editor-token.tok-keyword'),
    editorPanelsSource.indexOf('.variable-highlight-editor')
  );
  const metricChangingTokenStyles = Array.from(codeEditorTokenCss.matchAll(/font-(?:style|weight)\s*:\s*([^;]+);/g))
    .map((match) => match[0])
    .filter((declaration) => !/:\s*inherit\s*;/.test(declaration));
  assert.deepEqual(metricChangingTokenStyles, []);
  assert.match(rendererSource, /pendingDiagnosticsSettingsSave/);
  assert.match(rendererSource, /Switch to this workspace before exporting local diagnostics/);
  assert.match(rendererSource, /Saving diagnostics privacy settings before export/);
  assert.match(rendererSource, /function requestTabMethodText\(request, tab = {}\)/);
  assert.match(rendererSource, /`RUN - \$\{method\}`/);
  assert.match(rendererSource, /col: 'entity-collection'/);
  assert.match(rendererSource, /methodClassName: \(\) => tagClassName\('ENV'\)/);
  assert.match(rendererSource, /badge\.className = \['tree-badge', tagClassName\(kind\)\]/);
});

test('renderer bootstrap binds auth input and modal draft confirmation events', () => {
  const calls = {
    authType: [],
    authInput: 0,
    performanceAuthType: [],
    performanceAuthInput: 0,
    resolveModal: []
  };
  const elements = new Map([
    ['authTypeSelect', createElement({ tagName: 'SELECT', value: 'oauth2' })],
    ['performanceAuthTypeSelect', createElement({ tagName: 'SELECT', value: 'apiKey' })],
    ['performanceAuthApiKeyNameInput', createElement({ value: 'api_key' })],
    ['confirmSaveDraftButton', createElement()],
    ['confirmExportCollectionButton', createElement()],
    ['confirmExportItemButton', createElement()],
    ['confirmFolderDestinationButton', createElement()],
    ['confirmRunnerImportButton', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);
  const documentListeners = new Map();
  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(name, handler) {
      documentListeners.set(name, handler);
    }
  };
  const fakeWindow = {
    addEventListener() {}
  };

  bindUi({
    doc: fakeDocument,
    windowObject: fakeWindow,
    onAuthTypeChange: (value) => calls.authType.push(value),
    onAuthInput: () => { calls.authInput += 1; },
    onPerformanceAuthTypeChange: (value) => calls.performanceAuthType.push(value),
    onPerformanceAuthInput: () => { calls.performanceAuthInput += 1; },
    onResolveActiveModal: (value) => calls.resolveModal.push(value),
    getSelectedDraftSaveCollectionId: () => 'collection-1',
    getSelectedExportCollectionId: () => 'collection-2',
    getSelectedExportItemId: () => 'runner-1',
    getSelectedFolderDestination: () => '{"collectionId":"collection-2","folderId":"folder-1"}',
    getSelectedRunnerImportTarget: () => ({ type: 'request', collectionId: 'collection-1', requestId: 'request-1' })
  });

  elements.get('authTypeSelect').dispatch('change');
  elements.get('performanceAuthTypeSelect').dispatch('change');
  elements.get('performanceAuthApiKeyNameInput').dispatch('input');
  elements.get('confirmSaveDraftButton').dispatch('click');
  elements.get('confirmExportCollectionButton').dispatch('click');
  elements.get('confirmExportItemButton').dispatch('click');
  elements.get('confirmFolderDestinationButton').dispatch('click');
  elements.get('confirmRunnerImportButton').dispatch('click');

  assert.deepEqual(calls.authType, ['oauth2']);
  assert.equal(calls.authInput, 1);
  assert.deepEqual(calls.performanceAuthType, ['apiKey']);
  assert.equal(calls.performanceAuthInput, 2);
  assert.deepEqual(calls.resolveModal, [
    'collection-1',
    'collection-2',
    'runner-1',
    '{"collectionId":"collection-2","folderId":"folder-1"}',
    { type: 'request', collectionId: 'collection-1', requestId: 'request-1' }
  ]);
});

test('renderer bootstrap resolves text, confirmation, and notification modals', () => {
  const resolved = [];
  const elements = new Map([
    ['textInputModal', createElement()],
    ['textInputModalInput', createElement({ tagName: 'TEXTAREA', value: 'textarea-value' })],
    ['textInputModalSingleLineInput', createElement({ tagName: 'INPUT', value: 'single-line-value' })],
    ['confirmTextInputModalButton', createElement()],
    ['cancelTextInputModalButton', createElement()],
    ['cancelExportItemButton', createElement()],
    ['cancelFolderDestinationButton', createElement()],
    ['confirmActionButton', createElement()],
    ['cancelConfirmActionButton', createElement()],
    ['closeNotificationModalButton', createElement()],
    ['cancelRunnerImportButton', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);
  elements.get('textInputModal').dataset.valueControl = 'textInputModalSingleLineInput';

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return [elements.get('exportRequestPanelMenu')];
        }
        if (selector === '.menu-trigger') {
          return [elements.get('exportRequestPanelButton')];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onResolveActiveModal: (value) => resolved.push(value)
  });

  elements.get('confirmTextInputModalButton').dispatch('click');
  elements.get('cancelTextInputModalButton').dispatch('click');
  elements.get('cancelExportItemButton').dispatch('click');
  elements.get('cancelFolderDestinationButton').dispatch('click');
  elements.get('confirmActionButton').dispatch('click');
  elements.get('cancelConfirmActionButton').dispatch('click');
  elements.get('closeNotificationModalButton').dispatch('click');
  elements.get('cancelRunnerImportButton').dispatch('click');

  assert.deepEqual(resolved, ['single-line-value', null, null, null, true, false, true, null]);
});

test('renderer bootstrap binds CSV variable edit buttons and modal controls', () => {
  const calls = [];
  const elements = new Map([
    ['runnerCsvVariablesButton', createElement()],
    ['runnerCsvVariablesMenu', createElement()],
    ['runnerToggleCsvVariablesButton', createElement()],
    ['runnerEditCsvVariablesButton', createElement()],
    ['performanceCsvVariablesButton', createElement()],
    ['performanceCsvVariablesMenu', createElement()],
    ['performanceToggleCsvVariablesButton', createElement()],
    ['performanceEditCsvVariablesButton', createElement()],
    ['closeCsvVariablesModalButton', createElement()],
    ['cancelCsvVariablesModalButton', createElement()],
    ['saveCsvVariablesModalButton', createElement()],
    ['csvVariablesImportButton', createElement()],
    ['clearCsvVariablesFileButton', createElement()],
    ['csvVariablesLoadFileButton', createElement()],
    ['csvVariablesKeepFileButton', createElement()],
    ['csvVariablesFileInput', createElement({ tagName: 'INPUT' })],
    ['csvVariablesFileSourceButton', createElement()],
    ['csvVariablesInlineSourceButton', createElement()],
    ['csvVariablesValuesToggle', createElement()],
    ['csvVariablesValuesInput', createElement({ tagName: 'TEXTAREA' })],
    ['csvVariablesReuseFirstRowInput', createElement({ tagName: 'INPUT' })],
    ['csvVariablesLoopRowsInput', createElement({ tagName: 'INPUT' })],
    ['csvVariablesContinueWithoutRowsInput', createElement({ tagName: 'INPUT' })],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return [elements.get('runnerCsvVariablesMenu'), elements.get('performanceCsvVariablesMenu')];
        }
        if (selector === '.menu-trigger') {
          return [elements.get('runnerCsvVariablesButton'), elements.get('performanceCsvVariablesButton')];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onToggleRunnerCsvVariables: () => calls.push('runner-toggle-csv'),
    onEditRunnerCsvVariables: () => calls.push('runner-csv'),
    onTogglePerformanceCsvVariables: () => calls.push('performance-toggle-csv'),
    onEditPerformanceCsvVariables: () => calls.push('performance-csv'),
    onResolveActiveModal: (value) => calls.push(`resolve:${value}`),
    onConfirmCsvVariablesModal: () => calls.push('save-csv'),
    onImportCsvVariablesFile: () => calls.push('import-csv'),
    onClearCsvVariablesFile: () => calls.push('clear-csv'),
    onLoadCsvVariablesFile: () => calls.push('load-csv'),
    onKeepCsvVariablesFile: () => calls.push('keep-csv'),
    onCsvVariablesFileSelected: () => calls.push('file-selected'),
    onSelectCsvVariablesSource: (source) => calls.push(`source:${source}`),
    onToggleCsvVariablesValues: () => calls.push('toggle-values'),
    onCsvVariablesValuesInput: () => calls.push('values-input'),
    onCsvVariablesRowModeChange: (mode) => calls.push(`row-mode:${mode}`)
  });

  elements.get('runnerCsvVariablesButton').dispatch('click');
  assert.equal(elements.get('runnerCsvVariablesMenu').hidden, false);
  elements.get('runnerToggleCsvVariablesButton').dispatch('click');
  elements.get('runnerEditCsvVariablesButton').dispatch('click');
  elements.get('performanceCsvVariablesButton').dispatch('click');
  assert.equal(elements.get('performanceCsvVariablesMenu').hidden, false);
  elements.get('performanceToggleCsvVariablesButton').dispatch('click');
  elements.get('performanceEditCsvVariablesButton').dispatch('click');
  for (const id of [
    'closeCsvVariablesModalButton',
    'cancelCsvVariablesModalButton',
    'saveCsvVariablesModalButton',
    'csvVariablesImportButton',
    'clearCsvVariablesFileButton',
    'csvVariablesLoadFileButton',
    'csvVariablesKeepFileButton'
  ]) {
    elements.get(id).dispatch('click');
  }
  elements.get('csvVariablesFileInput').dispatch('change');
  elements.get('csvVariablesFileSourceButton').dispatch('click');
  elements.get('csvVariablesInlineSourceButton').dispatch('click');
  elements.get('csvVariablesValuesToggle').dispatch('click');
  elements.get('csvVariablesValuesInput').dispatch('input');
  elements.get('csvVariablesReuseFirstRowInput').dispatch('change');
  elements.get('csvVariablesLoopRowsInput').dispatch('change');
  elements.get('csvVariablesContinueWithoutRowsInput').dispatch('change');

  assert.deepEqual(calls, [
    'runner-toggle-csv',
    'runner-csv',
    'performance-toggle-csv',
    'performance-csv',
    'resolve:null',
    'resolve:null',
    'save-csv',
    'import-csv',
    'clear-csv',
    'load-csv',
    'keep-csv',
    'file-selected',
    'source:file',
    'source:inline',
    'toggle-values',
    'values-input',
    'row-mode:reuse',
    'row-mode:loop',
    'row-mode:continue'
  ]);
});

test('renderer bootstrap binds settings menu, category, theme, and setting controls', () => {
  const calls = [];
  const settingsSections = [
    'appearance',
    'tabs',
    'modals',
    'updates',
    'scripts',
    'vault',
    'packages',
    'files',
    'diagnostics'
  ];
  const settingsButtons = settingsSections.map((section) => {
    const button = createElement();
    button.dataset.settingsSection = section;
    return button;
  });
  const themeDarkButton = createElement();
  themeDarkButton.dataset.themeOption = 'dark';
  const elements = new Map([
    ['closeSettingsModalButton', createElement()],
    ['closeSettingsModalFooterButton', createElement()],
    ['interfaceFontSelect', createElement({ tagName: 'SELECT' })],
    ['interfaceFontSizeInput', createElement({ tagName: 'INPUT' })],
    ['resetInterfaceTypographyButton', createElement()],
    ['editorFontSelect', createElement({ tagName: 'SELECT' })],
    ['editorFontSizeInput', createElement({ tagName: 'INPUT' })],
    ['resetEditorTypographyButton', createElement()],
    ['showEditorLineNumbersInput', createElement({ tagName: 'INPUT' })],
    ['showVariableTooltipHintsInput', createElement({ tagName: 'INPUT' })],
    ['saveOnForceCloseInput', createElement({ tagName: 'INPUT' })],
    ['closeModalsOnBackdropClickInput', createElement({ tagName: 'INPUT' })],
    ['includePrereleasesInput', createElement({ tagName: 'INPUT' })],
    ['trustedScriptSendRequestInput', createElement({ tagName: 'INPUT' })],
    ['trustedScriptCookiesInput', createElement({ tagName: 'INPUT' })],
    ['trustedScriptVaultInput', createElement({ tagName: 'INPUT' })],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-settings-section]') {
          return settingsButtons;
        }
        if (selector === '[data-theme-option]') {
          return [themeDarkButton];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onSelectSettingsSection: (section) => calls.push(`section:${section}`),
    onSelectTheme: (theme) => calls.push(`theme:${theme}`),
    onInterfaceTypographyChange: () => calls.push('interface-typography'),
    onEditorTypographyChange: () => calls.push('editor-typography'),
    onResetInterfaceTypography: () => calls.push('reset-interface-typography'),
    onResetEditorTypography: () => calls.push('reset-editor-typography'),
    onShowEditorLineNumbersChange: () => calls.push('line-numbers'),
    onShowVariableTooltipHintsChange: () => calls.push('variable-tooltip-hints'),
    onSaveOnForceCloseChange: () => calls.push('save-on-force-close'),
    onCloseModalsOnBackdropClickChange: () => calls.push('close-modals-on-backdrop'),
    onIncludePrereleasesChange: () => calls.push('include-prereleases'),
    onTrustedScriptCapabilityChange: () => calls.push('script-capability'),
    onResolveActiveModal: (value) => calls.push(`resolve:${value}`)
  });

  settingsButtons.find((button) => button.dataset.settingsSection === 'tabs').dispatch('click');
  themeDarkButton.dispatch('click');
  elements.get('interfaceFontSelect').dispatch('change');
  elements.get('interfaceFontSizeInput').dispatch('change');
  elements.get('resetInterfaceTypographyButton').dispatch('click');
  elements.get('editorFontSelect').dispatch('change');
  elements.get('editorFontSizeInput').dispatch('change');
  elements.get('resetEditorTypographyButton').dispatch('click');
  elements.get('showEditorLineNumbersInput').dispatch('change');
  elements.get('showVariableTooltipHintsInput').dispatch('change');
  elements.get('saveOnForceCloseInput').dispatch('change');
  settingsButtons.find((button) => button.dataset.settingsSection === 'modals').dispatch('click');
  elements.get('closeModalsOnBackdropClickInput').dispatch('change');
  for (const section of ['updates', 'scripts', 'vault', 'packages', 'files', 'diagnostics', 'appearance']) {
    settingsButtons.find((button) => button.dataset.settingsSection === section).dispatch('click');
  }
  elements.get('includePrereleasesInput').dispatch('change');
  elements.get('trustedScriptSendRequestInput').dispatch('change');
  elements.get('trustedScriptCookiesInput').dispatch('change');
  elements.get('trustedScriptVaultInput').dispatch('change');
  elements.get('closeSettingsModalButton').dispatch('click');
  elements.get('closeSettingsModalFooterButton').dispatch('click');

  assert.deepEqual(calls, [
    'section:tabs',
    'theme:dark',
    'interface-typography',
    'interface-typography',
    'reset-interface-typography',
    'editor-typography',
    'editor-typography',
    'reset-editor-typography',
    'line-numbers',
    'variable-tooltip-hints',
    'save-on-force-close',
    'section:modals',
    'close-modals-on-backdrop',
    'section:updates',
    'section:scripts',
    'section:vault',
    'section:packages',
    'section:files',
    'section:diagnostics',
    'section:appearance',
    'include-prereleases',
    'script-capability',
    'script-capability',
    'script-capability',
    'resolve:true',
    'resolve:true'
  ]);
});

test('renderer bootstrap keeps active modals open when the backdrop is clicked by default', () => {
  let cancelCount = 0;
  const elements = new Map([
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onCancelActiveModal: () => {
      cancelCount += 1;
    }
  });

  elements.get('modalBackdrop').dispatch('click');

  assert.equal(cancelCount, 0);
});

test('renderer bootstrap supports opt-in modal backdrop dismissal for future preferences', () => {
  let cancelCount = 0;
  const elements = new Map([
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    closeModalsOnBackdropClick: () => true,
    onCancelActiveModal: () => {
      cancelCount += 1;
    }
  });

  elements.get('modalBackdrop').dispatch('click');

  assert.equal(cancelCount, 1);
});

test('renderer bootstrap binds every collection and request export menu button', () => {
  const calls = [];
  const controls = [
    ['exportRequestButton', 'request-postmeter', 'onExportRequest'],
    ['exportRequestCurlButton', 'request-curl', 'onExportRequestCurl'],
    ['exportCollectionButton', 'postmeter', 'onExportCollection'],
    ['exportPostmanButton', 'postman', 'onExportPostman'],
    ['exportOpenApiButton', 'openapi', 'onExportOpenApi'],
    ['exportCurlButton', 'curl', 'onExportCurl']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap binds generated header visibility and token controls', () => {
  const calls = [];
  const elements = new Map([
    ['sendPostMeterTokenInput', createElement()],
    ['showGeneratedHeadersInput', createElement()],
    ['performanceSendPostMeterTokenInput', createElement()],
    ['performanceShowGeneratedHeadersInput', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onPostMeterTokenHeaderChange: () => calls.push('request-token'),
    onShowGeneratedHeadersChange: () => calls.push('request-generated'),
    onPerformancePostMeterTokenHeaderChange: () => calls.push('performance-token'),
    onPerformanceShowGeneratedHeadersChange: () => calls.push('performance-generated')
  });

  for (const element of elements.values()) {
    element.dispatch('change');
  }

  assert.deepEqual(calls, [
    'request-token',
    'request-generated',
    'performance-token',
    'performance-generated'
  ]);
});

test('renderer bootstrap binds performance creation import export run and config controls', () => {
  const calls = [];
  const controlIds = [
    'newPerformanceTestMenuButton',
    'emptyCreatePerformanceTestButton',
    'importPerformanceTestButton',
    'exportPerformanceTestMenuButton',
    'performanceCsvVariablesButton',
    'performanceCsvVariablesMenu',
    'performanceToggleCsvVariablesButton',
    'performanceEditCsvVariablesButton',
    'savePerformanceTestButton',
    'deletePerformanceTestButton',
    'runPerformanceTestButton',
    'cancelPerformanceTestButton',
    'exportPerformanceTestButton',
    'exportPerformanceResultCsvButton',
    'importPerformanceRequestButton',
    'calibratePerformanceButton',
    'closePerformanceCalibrationModalButton',
    'addPerformanceParamButton',
    'addPerformanceHeaderButton',
    'addPerformanceRequestVariableButton',
    'addPerformanceCookieButton',
    'clearExpiredPerformanceCookiesButton',
    'performanceMethodSelect',
    'performanceUrlInput',
    'performanceBodyTypeSelect',
    'performanceBodyRawFormatSelect',
    'performanceBodyInput',
    'performanceGraphqlQueryInput',
    'performanceGraphqlVariablesInput',
    'performanceGraphqlOperationNameInput',
    'performanceDocsInput',
    'addPerformanceFormDataBodyRowButton',
    'addPerformanceUrlencodedBodyRowButton',
    'performanceBinaryBodySourceInput'
  ];
  const elements = new Map(controlIds.map((id) => [id, createElement({ tagName: id.endsWith('Select') ? 'SELECT' : 'INPUT' })]));
  const performanceEnvironmentControls = [createElement({ tagName: 'SELECT' })];
  const performanceMutationControls = [createElement({ tagName: 'INPUT' })];
  const performanceConfigControls = Array.from({ length: 5 }, () => createElement({ tagName: 'INPUT' }));
  const performanceSafetyControls = Array.from({ length: 3 }, () => createElement({ tagName: 'INPUT' }));
  const performanceTab = createElement();
  performanceTab.dataset.tabGroup = 'performance';
  performanceTab.dataset.tab = 'spike';

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-performance-environment]') {
          return performanceEnvironmentControls;
        }
        if (selector === '[data-performance-mutation]') {
          return performanceMutationControls;
        }
        if (selector === '[data-performance-config]') {
          return performanceConfigControls;
        }
        if (selector === '[data-performance-safety]') {
          return performanceSafetyControls;
        }
        if (selector === '.toolbar-menu') {
          return [elements.get('performanceCsvVariablesMenu')];
        }
        if (selector === '.menu-trigger') {
          return [elements.get('performanceCsvVariablesButton')];
        }
        if (selector === '.tab' || selector === '.tab[data-tab-group="performance"]') {
          return [performanceTab];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onNewPerformanceTest: () => calls.push('new'),
    onImportPerformanceTest: () => calls.push('import-test'),
    onExportPerformanceTest: () => calls.push('export-test'),
    onTogglePerformanceCsvVariables: () => calls.push('toggle-csv-performance'),
    onEditPerformanceCsvVariables: () => calls.push('csv-performance'),
    onSavePerformanceTest: () => calls.push('save'),
    onDeletePerformanceTest: () => calls.push('delete'),
    onRunPerformanceTest: () => calls.push('run'),
    onCancelPerformanceTest: () => calls.push('cancel'),
    onExportPerformanceResultCsv: () => calls.push('export-result-csv'),
    onImportPerformanceRequest: () => calls.push('import-request'),
    onAddPerformanceParam: () => calls.push('add-param'),
    onAddPerformanceHeader: () => calls.push('add-header'),
    onAddPerformanceRequestVariable: () => calls.push('add-variable'),
    onAddPerformanceCookie: () => calls.push('add-cookie'),
    onClearExpiredPerformanceCookies: () => calls.push('clear-cookies'),
    onCalibratePerformance: () => calls.push('calibrate'),
    onClosePerformanceCalibration: () => calls.push('close-calibration'),
    onPerformanceConfigChange: () => calls.push('config'),
    onPerformanceRequestChange: () => calls.push('request'),
    onPerformanceBodyTypeChange: () => calls.push('body-type'),
    onAddPerformanceFormDataBodyRow: () => calls.push('add-form-data'),
    onAddPerformanceUrlencodedBodyRow: () => calls.push('add-urlencoded'),
    onActivateTab: (group, tab) => calls.push(`${group}:${tab}`)
  });

  for (const id of [
    'newPerformanceTestMenuButton',
    'emptyCreatePerformanceTestButton',
    'importPerformanceTestButton',
    'exportPerformanceTestMenuButton',
    'performanceCsvVariablesButton',
    'performanceToggleCsvVariablesButton',
    'performanceEditCsvVariablesButton',
    'savePerformanceTestButton',
    'deletePerformanceTestButton',
    'runPerformanceTestButton',
    'cancelPerformanceTestButton',
    'exportPerformanceTestButton',
    'exportPerformanceResultCsvButton',
    'importPerformanceRequestButton',
    'addPerformanceParamButton',
    'addPerformanceHeaderButton',
    'addPerformanceRequestVariableButton',
    'addPerformanceCookieButton',
    'clearExpiredPerformanceCookiesButton',
    'calibratePerformanceButton',
    'closePerformanceCalibrationModalButton',
    'addPerformanceFormDataBodyRowButton',
    'addPerformanceUrlencodedBodyRowButton'
  ]) {
    elements.get(id).dispatch('click');
  }
  for (const control of [...performanceEnvironmentControls, ...performanceMutationControls]) {
    control.dispatch('change');
  }
  for (const control of [...performanceConfigControls, ...performanceSafetyControls]) {
    control.dispatch('input');
  }
  performanceConfigControls[0].dispatch('change');
  performanceTab.dispatch('click');
  elements.get('performanceMethodSelect').dispatch('change');
  elements.get('performanceUrlInput').dispatch('input');
  elements.get('performanceBodyTypeSelect').dispatch('change');
  elements.get('performanceBodyRawFormatSelect').dispatch('change');
  elements.get('performanceBodyInput').dispatch('input');
  elements.get('performanceGraphqlQueryInput').dispatch('input');
  elements.get('performanceGraphqlVariablesInput').dispatch('input');
  elements.get('performanceGraphqlOperationNameInput').dispatch('input');
  elements.get('performanceDocsInput').dispatch('input');
  elements.get('performanceBinaryBodySourceInput').dispatch('input');

  assert.deepEqual(calls.slice(0, 20), [
    'new',
    'new',
    'import-test',
    'export-test',
    'toggle-csv-performance',
    'csv-performance',
    'save',
    'delete',
    'run',
    'cancel',
    'export-test',
    'export-result-csv',
    'import-request',
    'add-param',
    'add-header',
    'add-variable',
    'add-cookie',
    'clear-cookies',
    'calibrate',
    'close-calibration'
  ]);
  assert.equal(calls.filter((call) => call === 'config').length, 11);
  assert.ok(calls.includes('add-form-data'));
  assert.ok(calls.includes('add-urlencoded'));
  assert.equal(calls.filter((call) => call === 'request').length, 8);
  assert.equal(calls.filter((call) => call === 'body-type').length, 2);
  assert.ok(calls.includes('performance:spike'));
});

test('renderer bootstrap closes open toolbar menus on Tab without native dialogs', () => {
  const button = createElement();
  const menu = createElement();
  const calls = [];
  const elements = new Map([
    ['importMenuButton', button],
    ['importMenu', menu]
  ]);
  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === '.toolbar-menu') {
        return [menu];
      }
      if (selector === '.menu-trigger') {
        return [button];
      }
      return [];
    },
    addEventListener() {}
  };

  bindUi({
    doc: fakeDocument,
    windowObject: { addEventListener() {} },
    onCloseContextMenu: () => calls.push('context'),
    onCloseFileSourceMenu: () => calls.push('file-source')
  });

  button.dispatch('click');
  assert.equal(menu.hidden, false);
  assert.equal(button.attributes['aria-expanded'], 'true');
  assert.deepEqual(calls, ['context', 'file-source']);

  menu.dispatch('keydown', { key: 'Tab' });

  assert.equal(menu.hidden, true);
  assert.equal(button.attributes['aria-expanded'], 'false');
});

test('tree context menus close on Tab and reset trigger expanded state', () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  const trigger = createElement();
  const menu = {
    children: [],
    hidden: true,
    offsetHeight: 80,
    offsetWidth: 120,
    style: {},
    textContent: '',
    append(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      return selector === 'button' ? this.children[0] : null;
    },
    querySelectorAll(selector) {
      return selector === 'button:not([disabled])' ? this.children : [];
    }
  };

  global.document = {
    activeElement: null,
    createElement() {
      return createElement();
    },
    getElementById(id) {
      return id === 'contextMenu' ? menu : null;
    }
  };
  global.window = { innerHeight: 768, innerWidth: 1024 };

  try {
    showContextMenu(32, 32, [['Rename', () => {}]], { focusFirst: true, trigger });
    assert.equal(menu.hidden, false);
    assert.equal(trigger.attributes['aria-expanded'], 'true');

    menu.onkeydown({
      key: 'Tab',
      preventDefault() {},
      target: menu.children[0]
    });

    assert.equal(menu.hidden, true);
    assert.equal(trigger.attributes['aria-expanded'], 'false');
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
});

test('tree context menus close toolbar peers before opening', () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  let peerCloseCount = 0;
  const menu = {
    children: [],
    hidden: true,
    offsetHeight: 80,
    offsetWidth: 120,
    style: {},
    textContent: '',
    append(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };

  global.document = {
    createElement() {
      return createElement();
    },
    getElementById(id) {
      return id === 'contextMenu' ? menu : null;
    }
  };
  global.window = { innerHeight: 768, innerWidth: 1024 };
  setContextMenuPeerCloser(() => {
    peerCloseCount += 1;
  });

  try {
    showContextMenu(32, 32, [['Rename', () => {}]]);
    assert.equal(peerCloseCount, 1);
    assert.equal(menu.hidden, false);
  } finally {
    setContextMenuPeerCloser(null);
    global.document = previousDocument;
    global.window = previousWindow;
  }
});

test('renderer bootstrap binds markdown pane preview and save buttons', () => {
  const elements = new Map([
    ['saveRequestButton', createElement()],
    ['docsPreview', createElement({ tagName: 'DIV' })],
    ['docsSaveButton', createElement()],
    ['docsCancelButton', createElement()],
    ['exportRequestPanelButton', createElement()],
    ['exportRequestPanelMenu', createElement()],
    ['exportRequestPanelPostmeterButton', createElement()],
    ['exportRequestPanelCurlButton', createElement()],
    ['collectionDescriptionPreview', createElement({ tagName: 'DIV' })],
    ['collectionDescriptionSaveButton', createElement()],
    ['collectionDescriptionCancelButton', createElement()],
    ['folderDescriptionPreview', createElement({ tagName: 'DIV' })],
    ['folderDescriptionSaveButton', createElement()],
    ['folderDescriptionCancelButton', createElement()],
    ['saveEnvironmentButton', createElement()]
  ]);
  const calls = [];
  let previewKeyPrevented = false;

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onSaveRequest: () => calls.push('request'),
    onEditRequestDocs: () => calls.push('docs-edit'),
    onSaveRequestDocs: () => calls.push('docs-save'),
    onCancelRequestDocs: () => calls.push('docs-cancel'),
    onExportCurrentRequest: () => calls.push('request-export'),
    onExportCurrentRequestCurl: () => calls.push('request-export-curl'),
    onEditCollectionDescription: () => calls.push('collection-description-edit'),
    onSaveCollectionDescription: () => calls.push('collection-description-save'),
    onCancelCollectionDescription: () => calls.push('collection-description-cancel'),
    onEditFolderDescription: () => calls.push('folder-description-edit'),
    onSaveFolderDescription: () => calls.push('folder-description-save'),
    onCancelFolderDescription: () => calls.push('folder-description-cancel'),
    onSaveEnvironment: () => calls.push('environment')
  });

  elements.get('saveRequestButton').dispatch('click');
  elements.get('docsPreview').dispatch('click');
  elements.get('docsSaveButton').dispatch('click');
  elements.get('docsCancelButton').dispatch('click');
  elements.get('exportRequestPanelButton').dispatch('click');
  assert.equal(elements.get('exportRequestPanelMenu').hidden, false);
  elements.get('exportRequestPanelPostmeterButton').dispatch('click');
  elements.get('exportRequestPanelMenu').hidden = true;
  elements.get('exportRequestPanelButton').dispatch('click');
  assert.equal(elements.get('exportRequestPanelMenu').hidden, false);
  elements.get('exportRequestPanelCurlButton').dispatch('click');
  elements.get('collectionDescriptionPreview').dispatch('keydown', {
    key: 'Enter',
    preventDefault() {
      previewKeyPrevented = true;
    }
  });
  elements.get('collectionDescriptionSaveButton').dispatch('click');
  elements.get('collectionDescriptionCancelButton').dispatch('click');
  elements.get('folderDescriptionPreview').dispatch('click');
  elements.get('folderDescriptionSaveButton').dispatch('click');
  elements.get('folderDescriptionCancelButton').dispatch('click');
  elements.get('saveEnvironmentButton').dispatch('click');

  assert.equal(previewKeyPrevented, true);

  assert.deepEqual(calls, [
    'request',
    'docs-edit',
    'docs-save',
    'docs-cancel',
    'request-export',
    'request-export-curl',
    'collection-description-edit',
    'collection-description-save',
    'collection-description-cancel',
    'folder-description-edit',
    'folder-description-save',
    'folder-description-cancel',
    'environment'
  ]);
});

test('renderer bootstrap binds request environment and runner import/export menu actions', () => {
  const controls = [
    ['importRequestButton', 'import-request', 'onImportRequest'],
    ['importEnvironmentButton', 'import-environment', 'onImportEnvironment'],
    ['importRunnerButton', 'import-runner', 'onImportRunner'],
    ['exportEnvironmentButton', 'export-environment', 'onExportEnvironment'],
    ['exportPostmanEnvironmentButton', 'export-postman-environment', 'onExportPostmanEnvironment'],
    ['exportRunnerDefinitionButton', 'export-runner', 'onExportRunnerDefinition']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const calls = [];
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap creates runners from the toolbar New menu and runner empty pane only', () => {
  const elements = new Map([
    ['newRunnerMenuButton', createElement()],
    ['newRunnerButton', createElement()],
    ['emptyCreateRunnerButton', createElement()]
  ]);
  const calls = [];

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onNewRunner: () => calls.push('runner')
  });

  elements.get('newRunnerButton').dispatch('click');
  elements.get('emptyCreateRunnerButton').dispatch('click');
  elements.get('newRunnerMenuButton').dispatch('click');

  assert.deepEqual(calls, ['runner', 'runner']);
});

test('renderer bootstrap binds workspace sandbox control buttons', () => {
  const calls = [];
  const controls = [
    ['addSandboxPackageButton', 'add-package', 'onAddSandboxPackage'],
    ['fetchSandboxPackageButton', 'fetch-package', 'onFetchSandboxPackage'],
    ['refreshSandboxPackagesButton', 'refresh-packages', 'onRefreshSandboxPackages'],
    ['bindSandboxFileButton', 'bind-file', 'onBindSandboxFile'],
    ['refreshSandboxFilesButton', 'refresh-files', 'onRefreshSandboxFiles'],
    ['bindVaultSecretButton', 'bind-vault', 'onBindVaultSecret'],
    ['refreshVaultMetadataButton', 'refresh-vault', 'onRefreshVaultMetadata'],
    ['resetVaultButton', 'reset-vault', 'onResetVault']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap binds diagnostics privacy controls and export button', () => {
  const changes = [];
  const exports = [];
  const diagnosticControlIds = [
    'diagnosticLoggingEnabledInput',
    'diagnosticLogLevelSelect',
    'diagnosticLogUrlsInput',
    'diagnosticLogHeadersInput',
    'diagnosticLogCookiesInput',
    'diagnosticLogBodiesInput',
    'diagnosticLogProtocolMessagesInput',
    'diagnosticLogScriptConsoleInput',
    'diagnosticLogPayloadIdentifiersInput'
  ];
  const elements = new Map([
    ...diagnosticControlIds.map((id) => [id, createElement({ tagName: id === 'diagnosticLogLevelSelect' ? 'SELECT' : 'INPUT' })]),
    ['exportDiagnosticsButton', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onDiagnosticsSettingsChange: (event) => changes.push(event.target),
    onExportDiagnostics: () => exports.push('export')
  });

  for (const id of diagnosticControlIds) {
    elements.get(id).dispatch('change');
  }
  elements.get('exportDiagnosticsButton').dispatch('click');

  assert.equal(changes.length, diagnosticControlIds.length);
  assert.deepEqual(exports, ['export']);
});

test('renderer bootstrap binds vault prompt decision buttons', () => {
  const decisions = [];
  const controls = [
    'denyVaultPromptButton',
    'allowVaultPromptRequestButton',
    'allowVaultPromptCollectionButton',
    'allowVaultPromptWorkspaceButton',
    'resetVaultPromptGrantsButton'
  ];
  const elements = new Map(controls.map((id) => [id, createElement()]));

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onResolveVaultPrompt: (decision) => decisions.push(decision)
  });

  for (const id of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(decisions, [
    { granted: false, scope: 'request' },
    { granted: true, scope: 'request' },
    { granted: true, scope: 'collection' },
    { granted: true, scope: 'workspace' },
    { granted: false, reset: true, scope: 'request' }
  ]);
});

test('renderer supplies handlers for all workspace sandbox controls', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  for (const optionName of [
    'onAddSandboxPackage',
    'onFetchSandboxPackage',
    'onRefreshSandboxPackages',
    'onBindSandboxFile',
    'onRefreshSandboxFiles',
    'onBindVaultSecret',
    'onRefreshVaultMetadata',
    'onResetVault',
    'onDiagnosticsSettingsChange',
    'onExportDiagnostics'
  ]) {
    assert.match(rendererSource, new RegExp(`${optionName}:`), `${optionName} should be passed to bindUi`);
  }
  assert.equal(
    [...rendererSource.matchAll(/onRefreshSandboxFiles:/g)].length,
    1,
    'onRefreshSandboxFiles should not be overwritten by a later bindUi option'
  );
  assert.match(rendererSource, /onRefreshSandboxFiles: refreshSandboxFileBindings/);
});

test('renderer Step 11 workflows do not rely on native prompt alert or confirm dialogs', () => {
  for (const relativePath of [
    'src/renderer/renderer.js',
    'src/renderer/rendererWorkflows.js',
    'src/renderer/rendererBootstrap.js',
    'src/renderer/requestTabState.js',
    'src/renderer/contextMenu.js',
    'src/renderer/codeEditor.js',
    'src/renderer/variableAutocomplete.js',
    'src/renderer/requestTabs.js'
  ]) {
    const source = fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /(^|[^A-Za-z0-9_$.])(?:prompt|alert|confirm)\s*\(/,
      `${relativePath} should use in-app modal workflows instead of native dialogs`
    );
  }
});

test('renderer cancels active OAuth flow when loaded workspace context resets', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  assert.match(rendererSource, /function cancelActiveOauthFlowForContextReset\(\)/);
  assert.match(rendererSource, /window\.postmeter\.oauth\.cancelFlow\(flowId\)/);
  assert.match(rendererSource, /function applyLoadedWorkspace\(loaded, options = \{\}\) \{\s*cancelActiveOauthFlowForContextReset\(\);/);
  assert.match(rendererSource, /function cancelActiveRuntimeForContextReset\(\)/);
  assert.match(rendererSource, /window\.postmeter\.runner\.cancel\(runnerId\)/);
});

test('renderer clears and scopes vault metadata to the active workspace context', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  assert.match(rendererSource, /let lastVaultMetadataWorkspaceId = null/);
  assert.match(rendererSource, /lastVaultMetadata = null;\s*lastVaultMetadataWorkspaceId = null;\s*activeOauthFlowId = null;\s*activeRunnerId = null;/);
  assert.match(rendererSource, /const metadataWorkspaceId = activeWorkspaceId \|\| ''/);
  assert.match(rendererSource, /if \(\(activeWorkspaceId \|\| ''\) !== metadataWorkspaceId\) \{\s*return;\s*\}/);
  assert.match(rendererSource, /lastVaultMetadataWorkspaceId = metadataWorkspaceId/);
  assert.match(rendererSource, /lastVaultMetadataWorkspaceId !== \(activeWorkspaceId \|\| ''\)/);
});

test('renderer supplies explicit collection export format handlers', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  for (const [optionName, format] of [
    ['onExportCollection', 'postmeter'],
    ['onExportPostman', 'postman'],
    ['onExportOpenApi', 'openapi'],
    ['onExportCurl', 'curl']
  ]) {
    assert.match(
      rendererSource,
      new RegExp(`${optionName}: \\(\\) => exportCollection\\(null, '${format}'\\)`),
      `${optionName} should pass the ${format} export format`
    );
  }
  assert.match(rendererSource, /onExportWorkspace: \(\) => \{ void exportWorkspaceFromPicker\(\); \}/);
  assert.match(rendererSource, /onExportEnvironment: \(\) => \{ void exportEnvironmentFromPicker\('postmeter'\); \}/);
  assert.match(rendererSource, /onExportPostmanEnvironment: \(\) => \{ void exportEnvironmentFromPicker\('postman'\); \}/);
  assert.match(rendererSource, /onExportRunnerDefinition: \(\) => \{ void exportRunnerDefinitionFromPicker\(\); \}/);
  assert.match(rendererSource, /onExportPerformanceTest: \(\) => \{ void exportPerformanceTestFromPicker\(\); \}/);
});

test('renderer exposes first-class runner UI and sends runner payloads through runtime IPC', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  const bootstrapSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/rendererBootstrap.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');

  assert.match(indexHtml, /id="runnersPanelTab"[^>]*>Runners<\/button>/);
  assert.match(indexHtml, /id="newRunnerMenuButton"[^>]*>Runner<\/button>/);
  assert.match(indexHtml, /id="runnerMainPanel"/);
  assert.match(indexHtml, /id="runnerImportModal"/);
  assert.match(indexHtml, /id="addRunnerRequestButton"/);
  assert.match(indexHtml, /id="runnerCsvVariablesButton"/);
  assert.match(indexHtml, /id="runnerAllowEnvironmentMutation"/);
  assert.match(indexHtml, /id="runnerToggleCsvVariablesButton"/);
  assert.match(indexHtml, /id="runnerEditCsvVariablesButton"/);
  assert.match(indexHtml, /id="csvVariablesModal"/);
  assert.match(indexHtml, /id="csvVariablesFileSourceButton"/);
  assert.match(indexHtml, /id="csvVariablesInlineSourceButton"/);
  assert.match(indexHtml, /id="csvVariablesValuesToggle"/);
  assert.match(indexHtml, /id="csvVariablesValuesPanel"/);
  assert.match(indexHtml, /id="csvVariablesReuseFirstRowInput"/);
  assert.match(indexHtml, /id="csvVariablesLoopRowsInput"/);
  assert.match(indexHtml, /id="csvVariablesContinueWithoutRowsInput"/);
  assert.match(indexHtml, /id="performanceToggleCsvVariablesButton"/);
  assert.match(indexHtml, /id="performanceEditCsvVariablesButton"/);
  assert.doesNotMatch(indexHtml, /id="runnerUseCsvVariablesInput"/);
  assert.doesNotMatch(indexHtml, /id="performanceUseCsvVariablesInput"/);
  assert.doesNotMatch(indexHtml, /id="newRunnerButton"/);
  assert.match(indexHtml, /id="emptyCreateRunnerButton"[^>]*>New Runner<\/button>/);
  assert.match(bootstrapSource, /bindClick\(doc, 'newRunnerMenuButton', options\.onNewRunner\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'emptyCreateRunnerButton', options\.onNewRunner\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'runnerToggleCsvVariablesButton', options\.onToggleRunnerCsvVariables\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'runnerEditCsvVariablesButton', options\.onEditRunnerCsvVariables\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'performanceToggleCsvVariablesButton', options\.onTogglePerformanceCsvVariables\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'performanceEditCsvVariablesButton', options\.onEditPerformanceCsvVariables\)/);
  assert.match(bootstrapSource, /bindChange\(doc, 'csvVariablesReuseFirstRowInput'/);
  assert.match(bootstrapSource, /bindClick\(doc, 'confirmRunnerImportButton'/);
  assert.doesNotMatch(bootstrapSource, /newRunnerButton/);
  assert.doesNotMatch(indexHtml, /id="resultsRunnerTabButton"/);
  assert.match(rendererSource, /const startRunner = window\.__postmeterStartRunner \|\| window\.postmeter\.runner\.start/);
  assert.match(rendererSource, /startRunner\(runnerId, cloneJson\(runner\), cloneJson\(runnerEnvironment\)/);
  assert.match(rendererSource, /result\?\.environmentMutationAllowed === true/);
  assert.doesNotMatch(rendererSource, /const runnerCollection = \{/);
});

test('renderer loads vault prompt queue before the app renderer', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
  const queueIndex = indexHtml.indexOf('src="vaultPromptQueue.js"');
  const rendererIndex = indexHtml.indexOf('src="renderer.js"');
  assert.ok(queueIndex >= 0, 'vaultPromptQueue.js should be loaded');
  assert.ok(rendererIndex >= 0, 'renderer.js should be loaded');
  assert.ok(queueIndex < rendererIndex, 'vaultPromptQueue.js should load before renderer.js');
});

test('renderer loads code editor helpers before request editor panels and renderer bootstrap', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
  const codeEditorIndex = indexHtml.indexOf('src="codeEditor.js"');
  const requestPanelsIndex = indexHtml.indexOf('src="requestEditorPanels.js"');
  const rendererIndex = indexHtml.indexOf('src="renderer.js"');
  assert.ok(codeEditorIndex >= 0, 'codeEditor.js should be loaded');
  assert.ok(requestPanelsIndex >= 0, 'requestEditorPanels.js should be loaded');
  assert.ok(rendererIndex >= 0, 'renderer.js should be loaded');
  assert.ok(codeEditorIndex < requestPanelsIndex, 'codeEditor.js should load before request editor panels are rendered.');
  assert.ok(codeEditorIndex < rendererIndex, 'codeEditor.js should load before renderer.js initializes textareas.');
});

function createElement({ tagName = 'BUTTON', value = '' } = {}) {
  const listeners = new Map();
  return {
    attributes: {},
    tagName,
    value,
    hidden: true,
    dataset: {},
    addEventListener(name, handler) {
      if (!listeners.has(name)) {
        listeners.set(name, []);
      }
      listeners.get(name).push(handler);
    },
    setAttribute(name, nextValue) {
      this.attributes[name] = String(nextValue);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    focus() {
      this.focused = true;
    },
    matches(selector) {
      return selector === 'button' && this.tagName === 'BUTTON';
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    dispatch(name, event = {}) {
      for (const handler of listeners.get(name) || []) {
        handler({
          stopPropagation() {},
          preventDefault: event.preventDefault || (() => {}),
          target: this,
          currentTarget: this,
          key: event.key
        });
      }
    }
  };
}
