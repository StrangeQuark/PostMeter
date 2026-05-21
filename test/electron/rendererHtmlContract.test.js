const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('node-html-parser');
const {
  appRendererAssetPathFromScriptSrc,
  APP_RENDERER_CORE_ASSET_PATHS,
  APP_RENDERER_CSP
} = require('../../electron/app-shell/rendererAssetManifest');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const HTML_ROOT = path.join(PROJECT_ROOT, 'src', 'renderer', 'html');
const INDEX_PATH = path.join(PROJECT_ROOT, 'src', 'renderer', 'index.html');
const MANIFEST_PATH = path.join(HTML_ROOT, 'manifest.json');
const EXPECTED_MANIFEST = [
  'shell/head-and-topbar.html',
  'shell/sidebar-and-workspace-open.html',
  'panels/collection.html',
  'panels/folder.html',
  'panels/request.html',
  'panels/environment-workspace.html',
  'panels/runner.html',
  'panels/performance.html',
  'panels/results-and-main-close.html',
  'modals/settings.html',
  'modals/workflow.html',
  'modals/input-security.html',
  'overlays/context-and-tutorial.html',
  'scripts.html'
];
const REQUIRED_IDS = [
  'newMenuButton',
  'newMenu',
  'importMenuButton',
  'importMenu',
  'exportMenuButton',
  'exportMenu',
  'environmentSelect',
  'appGrid',
  'collectionsPanelTab',
  'collectionsSidebarPanel',
  'environmentsPanelTab',
  'environmentsSidebarPanel',
  'runnersPanelTab',
  'runnersSidebarPanel',
  'performancePanelTab',
  'performanceSidebarPanel',
  'workspacesPanelTab',
  'workspacesSidebarPanel',
  'historyPanelTab',
  'historySidebarPanel',
  'mainPaneResize',
  'requestTabBar',
  'requestEmptyPanel',
  'lockedWorkspacePanel',
  'collectionMainPanel',
  'collectionOverviewTabButton',
  'collectionOverviewTab',
  'folderMainPanel',
  'folderOverviewTabButton',
  'folderOverviewTab',
  'requestEditorPanel',
  'requestNameTitle',
  'methodSelect',
  'urlInput',
  'sendButton',
  'validationLabel',
  'requestParamsTabButton',
  'paramsTab',
  'requestHeadersTabButton',
  'headersTab',
  'requestAuthTabButton',
  'authTab',
  'requestBodyTabButton',
  'bodyTab',
  'requestScriptsTabButton',
  'scriptsTab',
  'requestSettingsTabButton',
  'requestSettingsTab',
  'requestDocsTabButton',
  'docsTab',
  'bodyTypeSelect',
  'bodyInput',
  'graphqlQueryInput',
  'environmentMainPanel',
  'workspaceMainPanel',
  'runnerMainPanel',
  'runnerRequestList',
  'runnerResultsShell',
  'performanceMainPanel',
  'performanceRequestSection',
  'performanceResults',
  'responseBody',
  'settingsModal',
  'cookiesModal',
  'runnerImportModal',
  'exportCollectionModal',
  'requestExportModal',
  'textInputModal',
  'workspaceEncryptionModal',
  'clientCertificateModal',
  'csvVariablesModal',
  'confirmActionModal',
  'updateReminderModal',
  'authRefreshAutoDetectModal',
  'notificationModal',
  'performanceCalibrationModal',
  'filePickerModal',
  'vaultPromptModal',
  'contextMenu',
  'fileSourceMenu',
  'tutorialOverlay',
  'tutorialCoach'
];

test('renderer HTML manifest assembles exactly to src/renderer/index.html', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.deepEqual(manifest, EXPECTED_MANIFEST);

  const assembled = manifest.map((relativePath) => {
    assert.equal(path.isAbsolute(relativePath), false, `${relativePath} must be relative`);
    assert.equal(relativePath.includes('\\'), false, `${relativePath} must use POSIX separators`);
    assert.equal(relativePath.split('/').includes('..'), false, `${relativePath} must stay inside html root`);
    return fs.readFileSync(path.join(HTML_ROOT, relativePath), 'utf8');
  }).join('');
  assert.equal(fs.readFileSync(INDEX_PATH, 'utf8'), assembled);
});

test('renderer HTML keeps the stable V1 shell, editor, modal, and overlay IDs', () => {
  const { idMap } = parseRendererHtml();
  for (const id of REQUIRED_IDS) {
    assert.ok(idMap.has(id), `Missing renderer contract id #${id}`);
  }
});

test('renderer HTML IDs are unique and ARIA references resolve', () => {
  const { root, idMap } = parseRendererHtml();
  const seen = new Set();
  const duplicates = [];
  for (const element of root.querySelectorAll('[id]')) {
    const id = element.getAttribute('id');
    if (seen.has(id)) {
      duplicates.push(id);
    }
    seen.add(id);
  }
  assert.deepEqual(duplicates, []);

  for (const attributeName of ['aria-controls', 'aria-describedby', 'aria-labelledby']) {
    for (const element of root.querySelectorAll(`[${attributeName}]`)) {
      const references = String(element.getAttribute(attributeName) || '').split(/\s+/).filter(Boolean);
      for (const reference of references) {
        assert.ok(idMap.has(reference), `${attributeName} references missing #${reference}`);
      }
    }
  }
});

test('renderer tab and dialog relationships remain accessible', () => {
  const { root, idMap } = parseRendererHtml();

  for (const tab of root.querySelectorAll('[role="tab"][aria-controls]')) {
    const tabId = tab.getAttribute('id');
    const panelId = tab.getAttribute('aria-controls');
    const panel = idMap.get(panelId);
    assert.ok(tabId, `Tab for #${panelId} must have an id`);
    assert.ok(panel, `Tab #${tabId} controls missing panel #${panelId}`);
    assert.equal(panel.getAttribute('role'), 'tabpanel', `#${panelId} should be a tabpanel`);
    assert.ok(
      String(panel.getAttribute('aria-labelledby') || '').split(/\s+/).includes(tabId),
      `#${panelId} should be labelled by #${tabId}`
    );
  }

  const modals = root.querySelectorAll('.modal');
  assert.ok(modals.length >= 20, 'Expected the renderer modal catalog to be present');
  for (const modal of modals) {
    const modalId = modal.getAttribute('id');
    assert.equal(modal.getAttribute('role'), 'dialog', `#${modalId} must use role=dialog`);
    assert.equal(modal.getAttribute('aria-modal'), 'true', `#${modalId} must be modal`);
    assert.ok(modal.hasAttribute('hidden'), `#${modalId} should be hidden until opened`);
    const titleId = modal.getAttribute('aria-labelledby');
    assert.ok(titleId && idMap.has(titleId), `#${modalId} must reference an existing title`);
  }
});

test('renderer scripts, styles, and CSP stay in reviewed order', () => {
  const { root } = parseRendererHtml();
  const styleHrefs = root.querySelectorAll('link[rel="stylesheet"]').map((element) => element.getAttribute('href'));
  assert.deepEqual(styleHrefs, ['styles/theme.css', 'styles/base.css', 'styles/styles.css']);
  const csp = root.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');
  assert.equal(csp, APP_RENDERER_CSP);

  const scripts = root.querySelectorAll('script');
  assert.ok(scripts.length > 40, 'Expected renderer script manifest to be present');
  assert.deepEqual(
    scripts.filter((element) => !element.getAttribute('src')).map((element) => element.toString()),
    []
  );
  const actualScriptSources = scripts.map((element) => element.getAttribute('src'));
  const expectedScriptSources = [...fs.readFileSync(path.join(HTML_ROOT, 'scripts.html'), 'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map((match) => match[1]);
  assert.deepEqual(actualScriptSources, expectedScriptSources);
  assert.deepEqual(
    actualScriptSources
      .map((source) => appRendererAssetPathFromScriptSrc(source))
      .filter((assetPath) => assetPath.startsWith('/src/core/'))
      .sort(),
    [...APP_RENDERER_CORE_ASSET_PATHS].sort()
  );
});

function parseRendererHtml() {
  const root = parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const idMap = new Map();
  for (const element of root.querySelectorAll('[id]')) {
    idMap.set(element.getAttribute('id'), element);
  }
  return { idMap, root };
}
