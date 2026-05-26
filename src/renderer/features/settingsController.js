function renderSettings() {
  ensureSettings();
  applyThemePreference(workspace.settings.appearance.theme);
  applyTypographyPreferences();
  applyEditorPreferences();
  renderSettingsControls();
}

function openSettingsModalSafely(section = activeSettingsSection) {
  void openSettingsModal(section).catch((error) => {
    const message = error.message || String(error);
    console.error('Settings modal failed to open:', error);
    setStatus(`Settings failed to open: ${message}`);
    notifyUser('Settings Failed To Open', message);
  });
}

async function openSettingsModal(section = activeSettingsSection) {
  const modalPromise = showModal('settingsModal', true);
  try {
    renderSettingsControls();
    selectSettingsSection(section || 'appearance');
  } catch (error) {
    const message = error.message || String(error);
    console.error('Settings controls failed to render:', error);
    setStatus(`Settings failed to render: ${message}`);
  }
  return modalPromise;
}

function selectSettingsSection(section) {
  const normalizedSection = [
    'appearance',
    'shortcuts',
    'tabs',
    'modals',
    'updates',
    'scripts',
    'certificates',
    'vault',
    'packages',
    'files',
    'diagnostics'
  ].includes(String(section || '')) ? String(section) : 'appearance';
  activeSettingsSection = normalizedSection;
  for (const button of document.querySelectorAll('[data-settings-section]')) {
    const isActive = button.dataset.settingsSection === normalizedSection;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('.settings-section')) {
    const panelSection = panel.id
      .replace(/^settings/, '')
      .replace(/Section$/, '')
      .replace(/^[A-Z]/, (value) => value.toLowerCase());
    const isActive = panelSection === normalizedSection;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  }
  setKeyboardShortcutCaptureMode(normalizedSection === 'shortcuts' && state.activeModalId === 'settingsModal');
}

function renderSettingsControls() {
  ensureSettings();
  renderThemeControl();
  renderTypographyControls();
  renderKeyboardShortcutControls();
  if ($('saveOnForceCloseInput')) {
    $('saveOnForceCloseInput').checked = workspace.settings.tabs.saveOnForceClose === true;
  }
  if ($('closeModalsOnBackdropClickInput')) {
    $('closeModalsOnBackdropClickInput').checked = workspace.settings.modals.closeOnBackdropClick === true;
  }
  if ($('includePrereleasesInput')) {
    $('includePrereleasesInput').checked = workspace.settings.updates.includePrereleases === true;
  }
  if ($('automaticUpdatesInput')) {
    $('automaticUpdatesInput').checked = workspace.settings.updates.automaticUpdatesEnabled === true;
  }
  if ($('startupUpdateRemindersInput')) {
    $('startupUpdateRemindersInput').checked = workspace.settings.updates.startupRemindersEnabled !== false;
  }
  if ($('showEditorLineNumbersInput')) {
    $('showEditorLineNumbersInput').checked = workspace.settings.editor.lineNumbers !== false;
  }
  if ($('showVariableTooltipHintsInput')) {
    $('showVariableTooltipHintsInput').checked = workspace.settings.editor.variableTooltipHints !== false;
  }
  renderTlsSettingsControls();
  if ($('trustedScriptSendRequestInput')) {
    $('trustedScriptSendRequestInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.sendRequest === true;
  }
  if ($('trustedScriptCookiesInput')) {
    $('trustedScriptCookiesInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.cookies === true;
  }
  if ($('trustedScriptVaultInput')) {
    $('trustedScriptVaultInput').checked = workspace.settings?.sandbox?.trustedCapabilities?.vault === true;
  }
  renderDiagnosticsPrivacyPanel();
  renderSandboxPackageCachePanel();
  renderSandboxFileBindingsPanel();
  renderVaultMetadataPanel();
}

function renderKeyboardShortcutControls() {
  const list = $('keyboardShortcutsList');
  if (!list || !Array.isArray(KEYBOARD_SHORTCUT_ACTIONS)) {
    return;
  }
  const shortcuts = workspace.settings?.shortcuts || {};
  let lastGroup = '';
  const rows = [];
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    if (action.group !== lastGroup) {
      lastGroup = action.group;
      rows.push(`<div class="keyboard-shortcuts-group">${escapeHtmlText(lastGroup || 'Shortcuts')}</div>`);
    }
    const value = shortcuts[action.id] || '';
    const defaultValue = DEFAULT_KEYBOARD_SHORTCUTS[action.id] || '';
    const displayValue = keyboardShortcutDisplayText(value);
    const defaultDisplayValue = keyboardShortcutDisplayText(defaultValue);
    rows.push(`
      <div class="keyboard-shortcut-row">
        <div class="keyboard-shortcut-label">
          <span>${escapeHtmlText(action.label)}</span>
          <small>${defaultDisplayValue ? `Default: ${escapeHtmlText(defaultDisplayValue)}` : 'No default shortcut'}</small>
        </div>
        <input
          class="keyboard-shortcut-input"
          data-shortcut-action="${escapeHtmlAttribute(action.id)}"
          value="${escapeHtmlAttribute(displayValue)}"
          placeholder="Press shortcut"
          readonly
          aria-label="${escapeHtmlAttribute(`${action.label} shortcut`)}">
        <button type="button" data-shortcut-reset="${escapeHtmlAttribute(action.id)}">Reset</button>
      </div>
    `);
  }
  // postmeter-security-allow-html: keyboard shortcut rows escape all dynamic labels and values before assigning controlled settings markup.
  list.innerHTML = rows.join('');
}

function keyboardShortcutDisplayText(shortcut) {
  if (KEYBOARD_SHORTCUTS.formatShortcutForDisplay) {
    return KEYBOARD_SHORTCUTS.formatShortcutForDisplay(shortcut);
  }
  return String(shortcut || '').replace(/\bCmdOrCtrl\b/g, 'Ctrl');
}

function handleKeyboardShortcutCapture(event) {
  const input = event?.target?.closest?.('[data-shortcut-action]') || event?.target;
  const actionId = input?.dataset?.shortcutAction || '';
  if (!actionId) {
    return;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  if (event.key === 'Escape') {
    input.blur?.();
    return;
  }
  const shortcut = KEYBOARD_SHORTCUTS.recordShortcutFromEvent?.(event) || '';
  if (!shortcut) {
    return;
  }
  void setKeyboardShortcut(actionId, shortcut).finally(() => {
    input.blur?.();
  });
}

let keyboardShortcutCaptureModeActive = false;

function setKeyboardShortcutCaptureMode(active) {
  const nextActive = active === true;
  if (keyboardShortcutCaptureModeActive === nextActive) {
    return;
  }
  keyboardShortcutCaptureModeActive = nextActive;
  const setIgnored = window.postmeter?.app?.setMenuShortcutsIgnored;
  if (typeof setIgnored === 'function') {
    Promise.resolve(setIgnored(nextActive)).catch((error) => {
      const message = error?.message || String(error);
      setStatus(`Keyboard shortcut capture failed: ${message}`);
    });
  }
}

function resetKeyboardShortcutFromButton(event) {
  const button = event?.target?.closest?.('[data-shortcut-reset]');
  const actionId = button?.dataset?.shortcutReset || '';
  if (!actionId) {
    return;
  }
  event.preventDefault?.();
  const shortcut = DEFAULT_KEYBOARD_SHORTCUTS[actionId] || '';
  void setKeyboardShortcut(actionId, shortcut, { reset: true });
}

async function resetAllKeyboardShortcuts() {
  const confirmed = await confirmActionModal({
    title: 'Reset Keyboard Shortcuts?',
    message: 'Reset all keyboard shortcuts to their default values?',
    confirmLabel: 'Reset All',
    danger: true
  });
  if (!confirmed) {
    setStatus('Keyboard shortcut reset cancelled.');
    return false;
  }
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.shortcuts = KEYBOARD_SHORTCUTS.normalizeKeyboardShortcuts
    ? KEYBOARD_SHORTCUTS.normalizeKeyboardShortcuts(DEFAULT_KEYBOARD_SHORTCUTS)
    : { ...DEFAULT_KEYBOARD_SHORTCUTS };
  renderSettingsControls();
  return saveWorkspaceSettingsWithRollback(
    previousSettings,
    'Keyboard shortcuts reset.',
    'Keyboard shortcut reset failed',
    'Keyboard Shortcut Reset Failed'
  );
}

async function setKeyboardShortcut(actionId, shortcut, options = {}) {
  ensureSettings();
  if (!KEYBOARD_SHORTCUT_ACTIONS.some((action) => action.id === actionId)) {
    return false;
  }
  const normalizedShortcut = KEYBOARD_SHORTCUTS.normalizeShortcutText
    ? KEYBOARD_SHORTCUTS.normalizeShortcutText(shortcut, DEFAULT_KEYBOARD_SHORTCUTS[actionId] || '')
    : String(shortcut || '');
  const duplicateAction = duplicateKeyboardShortcutAction(actionId, normalizedShortcut);
  if (duplicateAction) {
    const confirmed = await confirmActionModal({
      title: 'Shortcut Already Assigned',
      message: `${keyboardShortcutDisplayText(normalizedShortcut)} is already assigned to ${duplicateAction.label}. Continue to assign it to ${shortcutActionLabel(actionId)} and clear ${duplicateAction.label}'s shortcut?`,
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel'
    });
    if (!confirmed) {
      setStatus('Keyboard shortcut change cancelled.');
      renderSettingsControls();
      return false;
    }
  }
  const previousSettings = cloneWorkspaceSettings();
  if (duplicateAction) {
    workspace.settings.shortcuts[duplicateAction.id] = '';
  }
  workspace.settings.shortcuts[actionId] = normalizedShortcut;
  renderSettingsControls();
  const action = KEYBOARD_SHORTCUT_ACTIONS.find((candidate) => candidate.id === actionId);
  const successMessage = duplicateAction
    ? `${action.label} shortcut updated. ${duplicateAction.label} shortcut cleared.`
    : options.reset === true
      ? `${action.label} shortcut reset.`
      : `${action.label} shortcut updated.`;
  return saveWorkspaceSettingsWithRollback(
    previousSettings,
    successMessage,
    'Keyboard shortcut save failed',
    'Keyboard Shortcut Save Failed'
  );
}

function shortcutActionLabel(actionId) {
  return KEYBOARD_SHORTCUT_ACTIONS.find((candidate) => candidate.id === actionId)?.label || 'this action';
}

function duplicateKeyboardShortcutAction(actionId, shortcut) {
  const normalizedShortcut = KEYBOARD_SHORTCUTS.normalizeShortcutText
    ? KEYBOARD_SHORTCUTS.normalizeShortcutText(shortcut)
    : String(shortcut || '');
  if (!normalizedShortcut) {
    return null;
  }
  for (const action of KEYBOARD_SHORTCUT_ACTIONS) {
    if (action.id === actionId) {
      continue;
    }
    const otherShortcut = KEYBOARD_SHORTCUTS.normalizeShortcutText
      ? KEYBOARD_SHORTCUTS.normalizeShortcutText(workspace.settings?.shortcuts?.[action.id])
      : String(workspace.settings?.shortcuts?.[action.id] || '');
    if (otherShortcut && otherShortcut === normalizedShortcut) {
      return action;
    }
  }
  return null;
}

function ensureSettings() {
  workspace.runners = normalizeWorkspaceRunners(workspace.runners);
  workspace.settings ||= {};
  workspace.settings.updates = {
    automaticUpdatesEnabled: workspace.settings.updates?.automaticUpdatesEnabled === true,
    includePrereleases: workspace.settings.updates?.includePrereleases === true,
    startupRemindersEnabled: workspace.settings.updates?.startupRemindersEnabled !== false
  };
  workspace.settings.shortcuts = KEYBOARD_SHORTCUTS.normalizeKeyboardShortcuts
    ? KEYBOARD_SHORTCUTS.normalizeKeyboardShortcuts(workspace.settings.shortcuts)
    : { ...DEFAULT_KEYBOARD_SHORTCUTS, ...(workspace.settings.shortcuts || {}) };
  workspace.settings.appearance ||= {};
  workspace.settings.tabs ||= { saveOnForceClose: false };
  workspace.settings.tabs.saveOnForceClose = workspace.settings.tabs.saveOnForceClose === true;
  workspace.settings.modals ||= { closeOnBackdropClick: false };
  workspace.settings.modals.closeOnBackdropClick = workspace.settings.modals.closeOnBackdropClick === true;
  workspace.settings.diagnostics = normalizeDiagnosticsSettings(workspace.settings.diagnostics);
  workspace.settings.editor ||= { lineNumbers: true, variableTooltipHints: true };
  workspace.settings.editor.lineNumbers = workspace.settings.editor.lineNumbers !== false;
  workspace.settings.editor.variableTooltipHints = workspace.settings.editor.variableTooltipHints !== false;
  workspace.settings.request = normalizeRendererTlsSettings(workspace.settings.request);
  workspace.settings.sandbox ||= { trustedCapabilities: { sendRequest: true, cookies: true, vault: true } };
  workspace.settings.sandbox.fileBindings = normalizeSandboxFileBindings(workspace.settings.sandbox.fileBindings);
  workspace.settings.sandbox.packageCache = normalizeSandboxPackageCache(workspace.settings.sandbox.packageCache);
  workspace.settings.sandbox.trustedCapabilities ||= { sendRequest: true, cookies: true, vault: true };
  workspace.settings.sandbox.trustedCapabilities.sendRequest = workspace.settings.sandbox.trustedCapabilities.sendRequest !== false;
  workspace.settings.sandbox.trustedCapabilities.cookies = workspace.settings.sandbox.trustedCapabilities.cookies !== false;
  workspace.settings.sandbox.trustedCapabilities.vault = workspace.settings.sandbox.trustedCapabilities.vault !== false;
  workspace.settings.sandbox.trustedCapabilities.vaultGrants = normalizeVaultGrants(
    workspace.settings.sandbox.trustedCapabilities.vaultGrants
  );
  workspace.settings.appearance.theme = normalizeThemeOption(workspace.settings.appearance.theme);
  workspace.settings.appearance.interfaceFont = normalizeInterfaceFontOption(workspace.settings.appearance.interfaceFont);
  workspace.settings.appearance.interfaceFontSize = normalizeInterfaceFontSize(workspace.settings.appearance.interfaceFontSize);
  workspace.settings.appearance.editorFont = normalizeEditorFontOption(workspace.settings.appearance.editorFont);
  workspace.settings.appearance.editorFontSize = normalizeEditorFontSize(workspace.settings.appearance.editorFontSize);
  delete workspace.settings.loadTestPolicy;
}

function normalizeRendererTlsSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    sslCertificateVerification: normalizeRendererGlobalSslVerification(source.sslCertificateVerification ?? source.sslVerification ?? source.strictSSL),
    caCertificatePath: source.caCertificatePath == null ? '' : String(source.caCertificatePath).trim(),
    clientCertificates: normalizeRendererClientCertificates(source.clientCertificates)
  };
}

function normalizeRendererGlobalSslVerification(value) {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['enabled', 'enable', 'true', 'on', 'yes'].includes(normalized)) {
      return true;
    }
    if (['disabled', 'disable', 'false', 'off', 'no'].includes(normalized)) {
      return false;
    }
  }
  return true;
}

function normalizeRendererClientCertificates(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .filter((item) => item && typeof item === 'object')
    .slice(0, 1000)
    .map((item, index) => ({
      id: String(item.id || `client-certificate-${index + 1}`),
      name: String(item.name || 'Client Certificate'),
      enabled: item.enabled !== false,
      host: String(item.host || '').trim(),
      port: String(item.port || '').trim(),
      matches: Array.isArray(item.matches) ? item.matches.map((match) => String(match || '').trim()).filter(Boolean) : [],
      certPath: String(item.certPath || '').trim(),
      keyPath: String(item.keyPath || '').trim(),
      pfxPath: String(item.pfxPath || '').trim(),
      caPath: String(item.caPath || '').trim(),
      passphrase: String(item.passphrase || ''),
      passphraseSecretKey: String(item.passphraseSecretKey || '').trim(),
      createdAt: String(item.createdAt || ''),
      updatedAt: String(item.updatedAt || '')
    }));
}

const RENDERER_DEFAULT_REQUEST_SETTINGS = Object.freeze({
  sslCertificateVerification: 'inherit',
  httpVersion: 'auto',
  followRedirects: true,
  followOriginalHttpMethod: false,
  followAuthorizationHeader: false,
  removeRefererHeaderOnRedirect: false,
  strictHttpParser: true,
  encodeUrlAutomatically: true,
  maxRedirects: 10,
  useServerCipherSuiteDuringHandshake: false,
  disabledTlsProtocols: '',
  cipherSuiteSelection: ''
});

function normalizeRendererRequestTlsSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    sslCertificateVerification: normalizeRendererRequestSslVerification(source.sslCertificateVerification),
    httpVersion: normalizeRendererHttpVersion(source.httpVersion),
    followRedirects: source.followRedirects !== false,
    followOriginalHttpMethod: source.followOriginalHttpMethod === true,
    followAuthorizationHeader: source.followAuthorizationHeader === true,
    removeRefererHeaderOnRedirect: source.removeRefererHeaderOnRedirect === true,
    strictHttpParser: source.strictHttpParser !== false,
    encodeUrlAutomatically: source.encodeUrlAutomatically !== false,
    maxRedirects: normalizeRendererMaxRedirects(source.maxRedirects),
    useServerCipherSuiteDuringHandshake: source.useServerCipherSuiteDuringHandshake === true,
    disabledTlsProtocols: normalizeRendererSettingsText(source.disabledTlsProtocols),
    cipherSuiteSelection: normalizeRendererSettingsText(source.cipherSuiteSelection)
  };
}

function normalizeRendererRequestSslVerification(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['inherit', 'enabled', 'disabled'].includes(normalized) ? normalized : 'inherit';
}

function normalizeRendererHttpVersion(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'http2') {
    return 'http2';
  }
  if (normalized === 'http1') {
    return 'http1';
  }
  return 'auto';
}

function normalizeRendererMaxRedirects(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return RENDERER_DEFAULT_REQUEST_SETTINGS.maxRedirects;
  }
  return Math.max(0, Math.min(100, Math.floor(number)));
}

function normalizeRendererSettingsText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
  }
  return String(value || '').trim();
}

const RENDERER_DIAGNOSTIC_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const RENDERER_DIAGNOSTIC_REQUEST_RESPONSE_FIELDS = [
  'urls',
  'headers',
  'cookies',
  'bodies',
  'protocolMessages',
  'scriptConsole',
  'payloadIdentifiers'
];

function normalizeDiagnosticsSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const level = RENDERER_DIAGNOSTIC_LOG_LEVELS.includes(String(source.logging?.level || '').toLowerCase())
    ? String(source.logging.level).toLowerCase()
    : 'info';
  const requestResponseSource = source.requestResponseLogging && typeof source.requestResponseLogging === 'object' && !Array.isArray(source.requestResponseLogging)
    ? source.requestResponseLogging
    : {};
  return {
    logging: {
      enabled: source.logging?.enabled !== false,
      level
    },
    requestResponseLogging: Object.fromEntries(RENDERER_DIAGNOSTIC_REQUEST_RESPONSE_FIELDS.map((field) => [
      field,
      requestResponseSource[field] === true
    ]))
  };
}

function normalizeSandboxPackageCache(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, 32)
    .map((item) => ({
      dependencyAliases: normalizePlainStringMap(item.dependencyAliases || item.dependencyMap, 32),
      specifier: String(item.specifier || item.name || '').trim(),
      source: String(item.source || item.code || ''),
      files: normalizeSandboxPackageFiles(item.files),
      integrity: String(item.integrity || '').trim(),
      dependencies: Array.isArray(item.dependencies) ? item.dependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 32) : [],
      maxExportKeys: Number.isFinite(Number(item.maxExportKeys)) ? Number(item.maxExportKeys) : undefined,
      entrypoint: item.entrypoint == null ? '' : String(item.entrypoint).slice(0, 256),
      fetchedAt: item.fetchedAt == null ? '' : String(item.fetchedAt).slice(0, 256),
      packageDependencies: Array.isArray(item.packageDependencies) ? item.packageDependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 64) : [],
      packageIntegrity: item.packageIntegrity == null ? '' : String(item.packageIntegrity).slice(0, 512),
      packageJson: normalizeSandboxPackageJson(item.packageJson || item.package || item.manifest),
      packageName: item.packageName == null ? '' : String(item.packageName).slice(0, 256),
      packageVersion: item.packageVersion == null ? '' : String(item.packageVersion).slice(0, 128),
      registry: item.registry == null ? '' : String(item.registry).slice(0, 32),
      reviewedAt: item.reviewedAt == null ? '' : String(item.reviewedAt).slice(0, 256),
      sourceUrl: item.sourceUrl == null ? '' : String(item.sourceUrl).slice(0, 2048)
    }))
    .filter((item) => item.specifier && item.source && item.integrity);
}

function normalizeSandboxPackageFiles(files) {
  const entries = Array.isArray(files)
    ? files.map((file) => [
      file?.path ?? file?.name ?? file?.filename,
      file?.source ?? file?.code ?? file?.text
    ])
    : Object.entries(files || {});
  const output = [];
  for (const [rawPath, rawSource] of entries.slice(0, 128)) {
    const filePath = normalizeSandboxPackageFilePath(rawPath);
    if (!filePath || output.some((file) => file.path === filePath)) {
      continue;
    }
    output.push({
      path: filePath,
      source: String(rawSource ?? '')
    });
  }
  return output;
}

function normalizeSandboxPackageFilePath(filePath) {
  let value = String(filePath || '').replace(/\\/g, '/').trim();
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || parts.some((part) => part === '.' || part.includes('\0'))) {
    return '';
  }
  return parts.join('/').slice(0, 512);
}

function normalizeSandboxPackageJson(packageJson) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(packageJson));
  } catch {
    return {};
  }
}

function normalizePlainStringMap(value, limit) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).slice(0, limit).reduce((output, [key, target]) => {
    const alias = String(key || '').trim();
    const specifier = String(target || '').trim();
    if (alias && specifier) {
      output[alias] = specifier;
    }
    return output;
  }, {});
}

function normalizeSandboxFileBindings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const output = [];
  for (const item of value) {
    const source = String(item?.source || item?.src || '').trim().slice(0, 32768);
    const localPath = String(item?.localPath || item?.path || item?.filePath || '').trim().slice(0, 32768);
    const bound = item?.bound === true || Boolean(localPath);
    if (!source || !bound || seen.has(source)) {
      continue;
    }
    seen.add(source);
    const binding = {
      id: String(item?.id || `file-binding-${seen.size}`).slice(0, 256),
      source,
      mode: normalizeSandboxFileMode(item?.mode),
      key: item?.key == null ? '' : String(item.key).slice(0, 512),
      contentType: item?.contentType == null ? '' : String(item.contentType).slice(0, 32768),
      fileName: item?.fileName == null ? '' : String(item.fileName).slice(0, 256),
      bound,
      enabled: item?.enabled !== false,
      reviewedAt: item?.reviewedAt == null ? '' : String(item.reviewedAt).slice(0, 256)
    };
    const displayName = item?.displayName == null ? '' : String(item.displayName).slice(0, 256);
    if (displayName) {
      binding.displayName = displayName;
    } else if (localPath) {
      binding.displayName = displayLocalFilePath(localPath);
    }
    output.push(binding);
    if (output.length >= 1000) {
      break;
    }
  }
  return output;
}

function normalizeSandboxFileMode(value) {
  const mode = String(value || 'file').trim().toLowerCase();
  return ['file', 'binary', 'formdata'].includes(mode) ? mode : 'file';
}

const SANDBOX_REVIEWED_PACKAGE_PATTERN = /^(?:npm:(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)@\d[\w.+-]*|jsr:@[a-z0-9._-]+\/[a-z0-9._-]+@\d[\w.+-]*|@[a-z0-9._-]+\/[a-z0-9._-]+)$/i;
const SANDBOX_PACKAGE_REQUIRE_PATTERN = /\b(?:pm\.)?require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const SANDBOX_SCRIPT_SOURCE_FIELDS = [
  'preRequest',
  'tests',
  'beforeQuery',
  'afterResponse',
  'beforeInvoke',
  'onMessage',
  'onIncomingMessage',
  'mock'
];

function sandboxPackageReferencesForWorkspace() {
  const references = new Map();
  for (const collection of workspace.collections || []) {
    collectSandboxPackageReferencesFromScripts(collection, references);
  }
  return [...references.values()].sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function collectSandboxPackageReferencesFromScripts(node, references) {
  for (const request of node.requests || []) {
    for (const field of SANDBOX_SCRIPT_SOURCE_FIELDS) {
      collectSandboxPackageReferencesFromText(request.scripts?.[field] || '', references);
    }
  }
  for (const folder of node.folders || []) {
    collectSandboxPackageReferencesFromScripts(folder, references);
  }
}

function collectSandboxPackageReferencesFromText(source, references) {
  const text = String(source || '');
  let match;
  while ((match = SANDBOX_PACKAGE_REQUIRE_PATTERN.exec(text)) !== null) {
    const specifier = String(match[2] || '').trim();
    if (!/^(?:npm:|jsr:|@)/i.test(specifier)) {
      continue;
    }
    if (!references.has(specifier)) {
      references.set(specifier, {
        pinned: SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier),
        specifier
      });
    }
  }
}

function sandboxPackageStatusRows() {
  ensureSettings();
  const cache = new Map((workspace.settings.sandbox.packageCache || []).map((item) => [item.specifier, item]));
  return sandboxPackageReferencesForWorkspace().map((reference) => {
    const cached = cache.get(reference.specifier);
    return {
      ...reference,
      cached: Boolean(cached),
      status: !reference.pinned
        ? 'Use @team/package, npm:package@version, or jsr:@scope/package@version'
        : cached
          ? 'Reviewed'
          : 'Missing reviewed package'
    };
  });
}

function sandboxFileReferencesForWorkspace() {
  const references = [];
  for (const collection of workspace.collections || []) {
    collectSandboxFileReferencesFromNode(collection, references);
  }
  for (const runner of workspace.runners || []) {
    collectSandboxFileReferencesFromNode(runner, references);
  }
  for (const test of workspace.performanceTests || []) {
    collectSandboxFileReferencesFromNode(test?.request, references);
  }
  const seen = new Set();
  return references.filter((reference) => {
    const source = String(reference.source || reference.src || '').trim();
    if (!source) {
      return false;
    }
    const key = `${reference.mode || 'file'}|${reference.key || ''}|${source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).sort((left, right) => String(left.source || left.src || '').localeCompare(String(right.source || right.src || '')));
}

function collectSandboxFileReferencesFromNode(node, references) {
  if (!node || typeof node !== 'object') {
    return;
  }
  for (const reference of Array.isArray(node.postman?.fileReferences) ? node.postman.fileReferences : []) {
    references.push({
      contentType: reference.contentType == null ? '' : String(reference.contentType),
      key: reference.key == null ? '' : String(reference.key),
      mode: normalizeSandboxFileMode(reference.mode),
      source: String(reference.source || reference.src || '')
    });
  }
  for (const reference of fileReferencesFromPostmanBody(node.postmanBody)) {
    references.push(reference);
  }
  for (const request of node.requests || []) {
    collectSandboxFileReferencesFromNode(request, references);
  }
  for (const folder of node.folders || []) {
    collectSandboxFileReferencesFromNode(folder, references);
  }
}

function sandboxFileBindingStatusRows() {
  ensureSettings();
  const bindings = new Map((workspace.settings.sandbox.fileBindings || []).map((binding) => [binding.source, binding]));
  return sandboxFileReferencesForWorkspace().map((reference) => {
    const binding = bindings.get(String(reference.source || ''));
    const bindingDisplayName = binding?.displayName || binding?.fileName || binding?.source || '';
    const bound = binding?.bound === true;
    return {
      ...reference,
      binding,
      bound,
      status: bound ? `Bound to ${bindingDisplayName || 'selected file'}` : 'Needs local file binding'
    };
  });
}

function displayLocalFilePath(value) {
  const text = String(value || '');
  return text.split(/[\\/]/).pop() || text;
}

function normalizeVaultGrants(value, workspaceGrant = false) {
  const grants = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    workspace: workspaceGrant === true || grants.workspace === true,
    collections: normalizeIdList(grants.collections),
    requests: normalizeIdList(grants.requests),
    deniedCollections: normalizeIdList(grants.deniedCollections),
    deniedRequests: normalizeIdList(grants.deniedRequests)
  };
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 1000);
}

function normalizeThemeOption(value) {
  const theme = String(value || '').trim();
  return THEME_OPTIONS.includes(theme) ? theme : 'system';
}

function normalizeInterfaceFontOption(value) {
  return normalizeTypographyFontOption(value, DEFAULT_INTERFACE_FONT);
}

function normalizeEditorFontOption(value) {
  return normalizeTypographyFontOption(value, DEFAULT_EDITOR_FONT);
}

function normalizeTypographyFontOption(value, fallback) {
  const font = String(value || '').trim();
  if (font === 'default' || Object.hasOwn(TYPOGRAPHY_FONT_STACKS, font)) {
    return font;
  }
  return fallback;
}

function normalizeInterfaceFontSize(value) {
  return normalizeFontSize(value, DEFAULT_INTERFACE_FONT_SIZE);
}

function normalizeEditorFontSize(value) {
  return normalizeFontSize(value, DEFAULT_EDITOR_FONT_SIZE);
}

function normalizeFontSize(value, fallback) {
  const numeric = Number(value);
  return TYPOGRAPHY_FONT_SIZE_OPTIONS.includes(numeric) ? numeric : fallback;
}

function applyThemePreference(theme) {
  const normalizedTheme = normalizeThemeOption(theme);
  document.documentElement.dataset.theme = normalizedTheme;
  syncForcedColorsPreference();
  try {
    localStorage.setItem('postmeter.theme', normalizedTheme);
  } catch {
    // Theme still applies for this session when storage is unavailable.
  }
}

function bindForcedColorsPreference() {
  const media = window.matchMedia?.('(forced-colors: active)');
  syncForcedColorsPreference(media);
  if (!media?.addEventListener) {
    return () => {};
  }
  const onChange = () => syncForcedColorsPreference(media);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function syncForcedColorsPreference(media = window.matchMedia?.('(forced-colors: active)')) {
  document.documentElement.dataset.forcedColors = media?.matches === true ? 'active' : 'inactive';
}

function renderThemeControl() {
  const activeTheme = normalizeThemeOption(workspace.settings?.appearance?.theme);
  for (const button of document.querySelectorAll('[data-theme-option]')) {
    const isActive = button.dataset.themeOption === activeTheme;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

function renderTypographyControls() {
  const appearance = workspace.settings?.appearance || {};
  const interfaceFont = normalizeInterfaceFontOption(appearance.interfaceFont);
  const interfaceFontSize = normalizeInterfaceFontSize(appearance.interfaceFontSize);
  const editorFont = normalizeEditorFontOption(appearance.editorFont);
  const editorFontSize = normalizeEditorFontSize(appearance.editorFontSize);
  if ($('interfaceFontSelect')) {
    $('interfaceFontSelect').value = interfaceFont;
  }
  if ($('interfaceFontSizeInput')) {
    $('interfaceFontSizeInput').value = String(interfaceFontSize);
  }
  if ($('editorFontSelect')) {
    $('editorFontSelect').value = editorFont;
  }
  if ($('editorFontSizeInput')) {
    $('editorFontSizeInput').value = String(editorFontSize);
  }
}

function applyTypographyPreferences() {
  ensureSettings();
  const appearance = workspace.settings.appearance;
  document.documentElement.style.setProperty('--ui-font', typographyFontStack(appearance.interfaceFont, DEFAULT_INTERFACE_FONT_STACK));
  document.documentElement.style.setProperty('--ui-font-size', `${appearance.interfaceFontSize}px`);
  document.documentElement.style.setProperty('--editor-font', typographyFontStack(appearance.editorFont, DEFAULT_EDITOR_FONT_STACK));
  document.documentElement.style.setProperty('--editor-font-size', `${appearance.editorFontSize}px`);
  fitPerformanceTypeSelectToOptions();
  refreshVariableHighlights(document);
}

function typographyFontStack(font, defaultStack) {
  if (font === 'default') {
    return defaultStack;
  }
  return TYPOGRAPHY_FONT_STACKS[font] || defaultStack;
}

async function setThemePreference(theme, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  const previousTheme = normalizeThemeOption(workspace.settings.appearance.theme);
  const normalizedTheme = normalizeThemeOption(theme);
  workspace.settings.appearance.theme = normalizedTheme;
  applyThemePreference(normalizedTheme);
  renderSettingsControls();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false ? '' : `Theme set to ${normalizedTheme}.`,
      'Theme save failed',
      'Theme Save Failed',
      () => {
        applyThemePreference(previousTheme);
        renderSettingsControls();
      }
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Theme set to ${normalizedTheme}.`);
  }
  return true;
}

function currentResolvedThemeMode(theme = workspace.settings?.appearance?.theme || document.documentElement.dataset.theme || 'system') {
  const normalizedTheme = normalizeThemeOption(theme);
  if (normalizedTheme === 'dark' || normalizedTheme === 'light') {
    return normalizedTheme;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true ? 'dark' : 'light';
}

async function setInterfaceTypographyFromControls(options = {}) {
  return setTypographyPreference({
    interfaceFont: $('interfaceFontSelect')?.value,
    interfaceFontSize: $('interfaceFontSizeInput')?.value
  }, {
    ...options,
    statusMessage: 'Interface typography updated.',
    failureMessage: 'Interface typography save failed',
    failureTitle: 'Interface Typography Save Failed'
  });
}

async function setEditorTypographyFromControls(options = {}) {
  return setTypographyPreference({
    editorFont: $('editorFontSelect')?.value,
    editorFontSize: $('editorFontSizeInput')?.value
  }, {
    ...options,
    statusMessage: 'Editor typography updated.',
    failureMessage: 'Editor typography save failed',
    failureTitle: 'Editor Typography Save Failed'
  });
}

async function resetInterfaceTypography(options = {}) {
  return setTypographyPreference({
    interfaceFont: DEFAULT_INTERFACE_FONT,
    interfaceFontSize: DEFAULT_INTERFACE_FONT_SIZE
  }, {
    ...options,
    statusMessage: 'Interface typography reset to defaults.',
    failureMessage: 'Interface typography reset failed',
    failureTitle: 'Interface Typography Reset Failed'
  });
}

async function resetEditorTypography(options = {}) {
  return setTypographyPreference({
    editorFont: DEFAULT_EDITOR_FONT,
    editorFontSize: DEFAULT_EDITOR_FONT_SIZE
  }, {
    ...options,
    statusMessage: 'Editor typography reset to defaults.',
    failureMessage: 'Editor typography reset failed',
    failureTitle: 'Editor Typography Reset Failed'
  });
}

async function setTypographyPreference(patch, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  const nextAppearance = {
    ...workspace.settings.appearance
  };
  if (Object.hasOwn(patch, 'interfaceFont')) {
    nextAppearance.interfaceFont = normalizeInterfaceFontOption(patch.interfaceFont);
  }
  if (Object.hasOwn(patch, 'interfaceFontSize')) {
    nextAppearance.interfaceFontSize = normalizeInterfaceFontSize(patch.interfaceFontSize);
  }
  if (Object.hasOwn(patch, 'editorFont')) {
    nextAppearance.editorFont = normalizeEditorFontOption(patch.editorFont);
  }
  if (Object.hasOwn(patch, 'editorFontSize')) {
    nextAppearance.editorFontSize = normalizeEditorFontSize(patch.editorFontSize);
  }
  const changed = [
    'interfaceFont',
    'interfaceFontSize',
    'editorFont',
    'editorFontSize'
  ].some((key) => workspace.settings.appearance[key] !== nextAppearance[key]);
  workspace.settings.appearance = nextAppearance;
  applyTypographyPreferences();
  renderSettingsControls();
  if (!changed) {
    return true;
  }
  if (options.save === true) {
    const saved = await saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false ? '' : options.statusMessage || 'Typography settings updated.',
      options.failureMessage || 'Typography settings save failed',
      options.failureTitle || 'Typography Settings Save Failed',
      () => {
        applyTypographyPreferences();
        renderSettingsControls();
      }
    );
    applyTypographyPreferences();
    return saved;
  }
  if (options.showStatus !== false) {
    setStatus(options.statusMessage || 'Typography settings updated.');
  }
  return true;
}

async function setIncludePrereleases(includePrereleases, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.updates.includePrereleases = includePrereleases === true;
  renderSettingsControls();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : `Prerelease update checks ${workspace.settings.updates.includePrereleases ? 'enabled' : 'disabled'}.`,
      'Prerelease setting save failed',
      'Update Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Prerelease update checks ${workspace.settings.updates.includePrereleases ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

async function setAutomaticUpdatesEnabled(enabled, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.updates.automaticUpdatesEnabled = enabled === true;
  renderSettingsControls();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : options.statusMessage || `Automatic updates ${workspace.settings.updates.automaticUpdatesEnabled ? 'enabled' : 'disabled'}.`,
      'Automatic update setting save failed',
      'Update Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(options.statusMessage || `Automatic updates ${workspace.settings.updates.automaticUpdatesEnabled ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

async function setStartupUpdateRemindersEnabled(enabled, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.updates.startupRemindersEnabled = enabled !== false;
  renderSettingsControls();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : options.statusMessage || `Startup update reminders ${workspace.settings.updates.startupRemindersEnabled ? 'enabled' : 'disabled'}.`,
      'Update reminder setting save failed',
      'Update Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(options.statusMessage || `Startup update reminders ${workspace.settings.updates.startupRemindersEnabled ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

async function setEditorLineNumbers(enabled, options = {}) {
  ensureSettings();
  const nextEnabled = enabled !== false;
  const currentEnabled = workspace.settings.editor.lineNumbers !== false;
  if (nextEnabled === currentEnabled) {
    applyEditorPreferences();
    renderSettingsControls();
    return true;
  }
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.editor.lineNumbers = nextEnabled;
  applyEditorPreferences();
  renderSettingsControls();
  if (options.save === true) {
    const saved = await saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : `Editor line numbers ${workspace.settings.editor.lineNumbers ? 'enabled' : 'disabled'}.`,
      'Editor setting save failed',
      'Editor Settings Save Failed',
      () => {
        applyEditorPreferences();
      }
    );
    applyEditorPreferences();
    return saved;
  }
  if (options.showStatus !== false) {
    setStatus(`Editor line numbers ${workspace.settings.editor.lineNumbers ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

function applyEditorPreferences() {
  ensureSettings();
  CodeEditor.setLineNumbersEnabled?.(workspace.settings.editor.lineNumbers !== false, document);
}

async function setVariableTooltipHints(enabled, options = {}) {
  ensureSettings();
  const nextEnabled = enabled !== false;
  const currentEnabled = workspace.settings.editor.variableTooltipHints !== false;
  if (nextEnabled === currentEnabled) {
    renderSettingsControls();
    return true;
  }
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.editor.variableTooltipHints = nextEnabled;
  renderSettingsControls();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : `Variable tooltip hints ${workspace.settings.editor.variableTooltipHints ? 'enabled' : 'disabled'}.`,
      'Variable tooltip setting save failed',
      'Editor Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Variable tooltip hints ${workspace.settings.editor.variableTooltipHints ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

function variableTooltipHintsEnabled() {
  ensureSettings();
  return workspace.settings.editor.variableTooltipHints !== false;
}

async function setSaveOnForceClose(saveOnForceClose, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.tabs.saveOnForceClose = saveOnForceClose === true;
  renderSettingsControls();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : `Save on force close ${workspace.settings.tabs.saveOnForceClose ? 'enabled' : 'disabled'}.`,
      'Force close setting save failed',
      'Force Close Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Save on force close ${workspace.settings.tabs.saveOnForceClose ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

async function setCloseModalsOnBackdropClick(closeOnBackdropClick, options = {}) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.modals.closeOnBackdropClick = closeOnBackdropClick === true;
  renderSettingsControls();
  if (options.save === true) {
    return saveWorkspaceSettingsWithRollback(
      previousSettings,
      options.showStatus === false
        ? ''
        : `Modal backdrop close ${workspace.settings.modals.closeOnBackdropClick ? 'enabled' : 'disabled'}.`,
      'Modal setting save failed',
      'Modal Settings Save Failed'
    );
  }
  if (options.showStatus !== false) {
    setStatus(`Modal backdrop close ${workspace.settings.modals.closeOnBackdropClick ? 'enabled' : 'disabled'}.`);
  }
  return true;
}

function forceCloseSavesChanges() {
  ensureSettings();
  return workspace.settings.tabs.saveOnForceClose === true;
}

function modalsCloseOnBackdropClick() {
  ensureSettings();
  return workspace.settings.modals.closeOnBackdropClick === true;
}

function cloneWorkspaceSettings() {
  if (typeof structuredClone === 'function') {
    return structuredClone(workspace.settings || {});
  }
  return JSON.parse(JSON.stringify(workspace.settings || {}));
}

async function saveWorkspaceSettingsWithRollback(previousSettings, successStatus, failureStatusPrefix, notificationTitle = 'Workspace Settings Save Failed', onRollback = null) {
  try {
    await saveWorkspace(false, { scope: 'settings', collectEditors: false });
    renderWorkspacePanel();
    renderSettingsControls();
    if (successStatus) {
      setStatus(successStatus);
    }
    return true;
  } catch (error) {
    const message = error.message || String(error);
    workspace.settings = previousSettings;
    renderWorkspacePanel();
    renderSettingsControls();
    if (typeof onRollback === 'function') {
      onRollback(error);
    }
    setStatus(`${failureStatusPrefix}: ${message}`);
    notifyUser(notificationTitle, message);
    return false;
  }
}

async function setTrustedScriptCapabilitiesFromInputs() {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.sandbox.trustedCapabilities.sendRequest = $('trustedScriptSendRequestInput').checked === true;
  workspace.settings.sandbox.trustedCapabilities.cookies = $('trustedScriptCookiesInput').checked === true;
  workspace.settings.sandbox.trustedCapabilities.vault = $('trustedScriptVaultInput').checked === true;
  const existingVaultGrants = workspace.settings.sandbox.trustedCapabilities.vaultGrants || {};
  workspace.settings.sandbox.trustedCapabilities.vaultGrants = normalizeVaultGrants(
    {
      ...existingVaultGrants,
      workspace: workspace.settings.sandbox.trustedCapabilities.vault === true
    },
    false
  );
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    'Script sandbox capabilities updated.',
    'Script sandbox capability update failed',
    'Sandbox Capability Save Failed'
  );
}

function renderTlsSettingsControls() {
  ensureSettings();
  const requestSettings = workspace.settings.request;
  const verificationInput = $('sslCertificateVerificationInput');
  if (verificationInput) {
    verificationInput.checked = requestSettings.sslCertificateVerification !== false;
  }
  const caInput = $('caCertificatePathInput');
  if (caInput && document.activeElement !== caInput) {
    setCertificateFileInputValue('caCertificatePathInput', requestSettings.caCertificatePath || '');
  }
  if (typeof bindSelectedFileLabelTrigger === 'function') {
    bindSelectedFileLabelTrigger('caCertificatePathInput', chooseWorkspaceCaCertificate);
  }
  renderClientCertificateList();
}

function setCertificateFileInputValue(inputOrId, value, options = {}) {
  if (typeof setSelectedFileValue === 'function') {
    setSelectedFileValue(inputOrId, value, options);
    return;
  }
  const input = typeof inputOrId === 'string' ? $(inputOrId) : inputOrId;
  if (!input) {
    return;
  }
  input.value = String(value || '').trim();
  if (typeof syncSelectedFileLabel === 'function') {
    syncSelectedFileLabel(input);
  }
}

function renderClientCertificateList() {
  const list = $('clientCertificateList');
  if (!list) {
    return;
  }
  const certificates = workspace.settings?.request?.clientCertificates || [];
  list.textContent = '';
  if (!certificates.length) {
    appendEmptyTestResult(list, 'No client certificates configured.');
    return;
  }
  certificates.forEach((certificate) => {
    const row = document.createElement('div');
    row.className = 'settings-list-row';
    const details = document.createElement('div');
    details.className = 'settings-list-details';
    const name = document.createElement('strong');
    name.textContent = certificate.name || 'Client Certificate';
    const meta = document.createElement('span');
    meta.textContent = [
      certificate.enabled === false ? 'Disabled' : 'Enabled',
      certificate.host || certificate.matches?.[0] || '*',
      certificate.port ? `:${certificate.port}` : '',
      certificate.pfxPath ? 'PFX/P12' : 'CRT/KEY'
    ].filter(Boolean).join(' ');
    details.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'settings-list-actions';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = certificate.enabled === false ? 'Enable' : 'Disable';
    toggle.addEventListener('click', () => { void toggleClientCertificate(certificate.id); });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => { void editClientCertificateFromPrompt(certificate.id); });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => { void removeClientCertificate(certificate.id); });
    actions.append(toggle, edit, remove);
    row.append(details, actions);
    list.append(row);
  });
}

async function setTlsSettingsFromInputs() {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.request.sslCertificateVerification = $('sslCertificateVerificationInput')?.checked !== false;
  workspace.settings.request.caCertificatePath = $('caCertificatePathInput')?.value.trim() || '';
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    'Certificate settings updated.',
    'Certificate setting save failed',
    'Certificate Settings Save Failed'
  );
}

async function chooseWorkspaceCaCertificate() {
  const selection = await chooseCertificateFile('Choose CA PEM file', '.pem,.crt,.cer');
  const binding = await storeMainOwnedLocalFile(selection, {
    contentKind: 'certificate',
    fileName: selection?.fileName || selection?.name || '',
    purpose: 'certificate'
  });
  if (!binding?.source) {
    return;
  }
  setCertificateFileInputValue('caCertificatePathInput', binding.source);
  await setTlsSettingsFromInputs();
}

async function clearWorkspaceCaCertificate() {
  setCertificateFileInputValue('caCertificatePathInput', '');
  await setTlsSettingsFromInputs();
}

async function addClientCertificateFromPrompt() {
  await upsertClientCertificateFromModal(null);
}

async function editClientCertificateFromPrompt(certificateId) {
  const existing = workspace.settings?.request?.clientCertificates?.find((item) => item.id === certificateId) || null;
  if (!existing) {
    return;
  }
  await upsertClientCertificateFromModal(existing);
}

async function upsertClientCertificateFromModal(existing = null) {
  ensureSettings();
  const now = new Date().toISOString();
  const certificateId = existing?.id || (crypto.randomUUID ? crypto.randomUUID() : `client-certificate-${Date.now()}`);
  const values = await promptClientCertificateModal(existing, certificateId);
  if (!values) {
    return;
  }
  const previousSettings = cloneWorkspaceSettings();
  const previousSecretKey = existing?.passphraseSecretKey || '';
  let passphraseSecretKey = previousSecretKey;
  let plainPassphrase = existing?.passphrase || '';
  if (values.passphrase) {
    passphraseSecretKey = await bindClientCertificatePassphrase(certificateId, values.passphrase);
    plainPassphrase = passphraseSecretKey ? '' : values.passphrase;
  }
  const certificate = {
    id: certificateId,
    name: values.name || 'Client Certificate',
    enabled: values.enabled !== false,
    host: values.host,
    port: values.port,
    matches: [],
    certPath: values.certPath,
    keyPath: values.keyPath,
    pfxPath: values.pfxPath,
    caPath: existing?.caPath || '',
    passphrase: plainPassphrase,
    passphraseSecretKey,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  workspace.settings.request.clientCertificates = [
    ...workspace.settings.request.clientCertificates.filter((item) => item.id !== certificate.id),
    certificate
  ];
  const saved = await saveWorkspaceSettingsWithRollback(
    previousSettings,
    existing ? 'Client certificate updated.' : 'Client certificate added.',
    'Client certificate save failed',
    'Client Certificate Save Failed'
  );
  if (!saved && passphraseSecretKey && passphraseSecretKey !== previousSecretKey) {
    await unsetClientCertificatePassphraseSecret(passphraseSecretKey);
  }
  if (saved && previousSecretKey && previousSecretKey !== passphraseSecretKey) {
    await unsetClientCertificatePassphraseSecret(previousSecretKey);
  }
}

async function promptClientCertificateModal(existing = null, certificateId = '') {
  configureClientCertificateModal(existing, certificateId);
  const result = await showModal('clientCertificateModal', null);
  resetClientCertificateModal();
  return result && typeof result === 'object' ? result : null;
}

function configureClientCertificateModal(existing = null, certificateId = '') {
  $('clientCertificateModalTitle').textContent = existing ? 'Edit client certificate' : 'Add client certificate';
  $('clientCertificateModalMessage').textContent = existing
    ? 'Update the host match and local certificate files for this client certificate.'
    : 'Configure the host match and local certificate files for HTTPS client authentication.';
  $('clientCertificateNameInput').value = existing?.name || 'Client Certificate';
  $('clientCertificateHostInput').value = existing?.host || existing?.matches?.[0] || '';
  $('clientCertificatePortInput').value = existing?.port || '';
  $('clientCertificateFormatSelect').value = existing?.pfxPath ? 'pfx' : 'pem';
  setCertificateFileInputValue('clientCertificateCertPathInput', existing?.certPath || '');
  setCertificateFileInputValue('clientCertificateKeyPathInput', existing?.keyPath || '');
  setCertificateFileInputValue('clientCertificatePfxPathInput', existing?.pfxPath || '');
  if (typeof bindSelectedFileLabelTrigger === 'function') {
    bindSelectedFileLabelTrigger('clientCertificateCertPathInput', () => chooseClientCertificatePath('cert'));
    bindSelectedFileLabelTrigger('clientCertificateKeyPathInput', () => chooseClientCertificatePath('key'));
    bindSelectedFileLabelTrigger('clientCertificatePfxPathInput', () => chooseClientCertificatePath('pfx'));
  }
  $('clientCertificatePassphraseInput').value = '';
  $('clientCertificatePassphraseInput').placeholder = existing ? 'Leave blank to keep current passphrase' : 'Optional';
  setClientCertificatePassphraseVisible(false);
  $('clientCertificateEnabledInput').checked = existing?.enabled !== false;
  $('clientCertificateModal').dataset.certificateId = certificateId || '';
  renderClientCertificateModalError('');
  updateClientCertificateModalFormat();
}

function resetClientCertificateModal() {
  for (const id of [
    'clientCertificateNameInput',
    'clientCertificateHostInput',
    'clientCertificatePortInput',
    'clientCertificatePassphraseInput'
  ]) {
    if ($(id)) {
      $(id).value = '';
    }
  }
  setCertificateFileInputValue('clientCertificateCertPathInput', '');
  setCertificateFileInputValue('clientCertificateKeyPathInput', '');
  setCertificateFileInputValue('clientCertificatePfxPathInput', '');
  setClientCertificatePassphraseVisible(false);
  renderClientCertificateModalError('');
}

function updateClientCertificateModalFormat() {
  const usePfx = $('clientCertificateFormatSelect')?.value === 'pfx';
  for (const element of document.querySelectorAll('.client-certificate-pem-field')) {
    element.hidden = usePfx;
  }
  for (const element of document.querySelectorAll('.client-certificate-pfx-field')) {
    element.hidden = !usePfx;
  }
}

async function chooseClientCertificatePath(kind) {
  const configs = {
    cert: {
      accept: '.crt,.cer,.pem',
      inputId: 'clientCertificateCertPathInput',
      title: 'Choose CRT file'
    },
    key: {
      accept: '.key,.pem',
      inputId: 'clientCertificateKeyPathInput',
      title: 'Choose KEY file'
    },
    pfx: {
      accept: '.pfx,.p12',
      inputId: 'clientCertificatePfxPathInput',
      title: 'Choose PFX/P12 file'
    }
  };
  const config = configs[kind];
  if (!config) {
    return;
  }
  const selection = await chooseCertificateFile(config.title, config.accept);
  const binding = await storeMainOwnedLocalFile(selection, {
    contentKind: 'certificate',
    fileName: selection?.fileName || selection?.name || '',
    purpose: 'certificate'
  });
  if (!binding?.source) {
    return;
  }
  const input = $(config.inputId);
  if (input) {
    setCertificateFileInputValue(input, binding.source);
  }
  renderClientCertificateModalError('');
}

function clearClientCertificatePath(kind) {
  const inputs = {
    cert: 'clientCertificateCertPathInput',
    key: 'clientCertificateKeyPathInput',
    pfx: 'clientCertificatePfxPathInput'
  };
  if (!inputs[kind]) {
    return;
  }
  setCertificateFileInputValue(inputs[kind], '');
  renderClientCertificateModalError('');
}

function toggleClientCertificatePassphraseVisibility() {
  const input = $('clientCertificatePassphraseInput');
  setClientCertificatePassphraseVisible(input?.type === 'password');
}

function setClientCertificatePassphraseVisible(visible) {
  const input = $('clientCertificatePassphraseInput');
  const button = $('toggleClientCertificatePassphraseButton');
  if (input) {
    input.type = visible ? 'text' : 'password';
  }
  if (button) {
    button.textContent = visible ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', visible ? 'true' : 'false');
    button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} client certificate passphrase`);
  }
}

function confirmClientCertificateModal() {
  const values = collectClientCertificateModalValues();
  if (!values.ok) {
    renderClientCertificateModalError(values.error);
    return;
  }
  resolveActiveModal(values.certificate);
}

function collectClientCertificateModalValues() {
  const format = $('clientCertificateFormatSelect')?.value === 'pfx' ? 'pfx' : 'pem';
  const name = String($('clientCertificateNameInput')?.value || '').trim() || 'Client Certificate';
  const host = String($('clientCertificateHostInput')?.value || '').trim();
  const port = String($('clientCertificatePortInput')?.value || '').trim();
  const certPath = format === 'pem' ? String($('clientCertificateCertPathInput')?.value || '').trim() : '';
  const keyPath = format === 'pem' ? String($('clientCertificateKeyPathInput')?.value || '').trim() : '';
  const pfxPath = format === 'pfx' ? String($('clientCertificatePfxPathInput')?.value || '').trim() : '';
  if (!host) {
    return { ok: false, error: 'Host is required.' };
  }
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
    return { ok: false, error: 'Port must be between 1 and 65535.' };
  }
  if (format === 'pem' && (!certPath || !keyPath)) {
    return { ok: false, error: 'PEM certificate and key files are required.' };
  }
  if (format === 'pfx' && !pfxPath) {
    return { ok: false, error: 'PFX/P12 file is required.' };
  }
  return {
    ok: true,
    certificate: {
      name,
      enabled: $('clientCertificateEnabledInput')?.checked !== false,
      host,
      port,
      certPath,
      keyPath,
      pfxPath,
      passphrase: String($('clientCertificatePassphraseInput')?.value || '')
    }
  };
}

function renderClientCertificateModalError(message) {
  const error = $('clientCertificateModalError');
  if (!error) {
    return;
  }
  error.textContent = String(message || '');
  error.hidden = !message;
}

async function chooseCertificateFile(title, accept) {
  return showLocalFilePicker({
    accept,
    fileBinding: true,
    dropDetail: 'or choose a certificate file from this computer.',
    dropTitle: 'Drop certificate file here',
    kind: 'certificate',
    message: 'Drop a certificate file here or choose one from this computer.',
    title
  });
}

async function bindClientCertificatePassphrase(certificateId, passphrase) {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : Date.now();
  const key = `client-certificate:${certificateId}:passphrase:${suffix}`;
  if (window.postmeter?.vault?.bindSecret) {
    try {
      await window.postmeter.vault.bindSecret(key, passphrase);
      return key;
    } catch {
      return '';
    }
  }
  return '';
}

async function unsetClientCertificatePassphraseSecret(secretKey) {
  if (secretKey && window.postmeter?.vault?.unsetSecret) {
    await window.postmeter.vault.unsetSecret(secretKey).catch(() => {});
  }
}

async function toggleClientCertificate(certificateId) {
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  const certificate = workspace.settings.request.clientCertificates.find((item) => item.id === certificateId);
  if (!certificate) {
    return;
  }
  certificate.enabled = certificate.enabled === false;
  certificate.updatedAt = new Date().toISOString();
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    `Client certificate ${certificate.enabled ? 'enabled' : 'disabled'}.`,
    'Client certificate update failed',
    'Client Certificate Save Failed'
  );
}

async function removeClientCertificate(certificateId) {
  ensureSettings();
  const certificate = workspace.settings.request.clientCertificates.find((item) => item.id === certificateId);
  if (!certificate) {
    return;
  }
  if (!(await confirmActionModal({
    title: 'Remove client certificate?',
    message: `Remove "${certificate.name || 'Client Certificate'}"?`,
    confirmLabel: 'Remove Certificate',
    danger: true
  }))) {
    return;
  }
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.request.clientCertificates = workspace.settings.request.clientCertificates.filter((item) => item.id !== certificateId);
  const saved = await saveWorkspaceSettingsWithRollback(
    previousSettings,
    'Client certificate removed.',
    'Client certificate removal failed',
    'Client Certificate Save Failed'
  );
  if (saved) {
    await unsetClientCertificatePassphraseSecret(certificate.passphraseSecretKey);
  }
}

async function setDiagnosticsSettingsFromInputs() {
  if (pendingDiagnosticsSettingsSave) {
    await pendingDiagnosticsSettingsSave;
  }
  const workspaceItem = activeWorkspaceItem();
  if (workspaceItem && workspaceItem.current !== true) {
    renderDiagnosticsPrivacyPanel();
    setStatus('Switch to this workspace before changing diagnostics privacy settings.');
    return false;
  }
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  const diagnostics = normalizeDiagnosticsSettings(workspace.settings.diagnostics);
  diagnostics.logging.enabled = $('diagnosticLoggingEnabledInput').checked === true;
  diagnostics.logging.level = RENDERER_DIAGNOSTIC_LOG_LEVELS.includes($('diagnosticLogLevelSelect').value)
    ? $('diagnosticLogLevelSelect').value
    : 'info';
  diagnostics.requestResponseLogging.urls = $('diagnosticLogUrlsInput').checked === true;
  diagnostics.requestResponseLogging.headers = $('diagnosticLogHeadersInput').checked === true;
  diagnostics.requestResponseLogging.cookies = $('diagnosticLogCookiesInput').checked === true;
  diagnostics.requestResponseLogging.bodies = $('diagnosticLogBodiesInput').checked === true;
  diagnostics.requestResponseLogging.protocolMessages = $('diagnosticLogProtocolMessagesInput').checked === true;
  diagnostics.requestResponseLogging.scriptConsole = $('diagnosticLogScriptConsoleInput').checked === true;
  diagnostics.requestResponseLogging.payloadIdentifiers = $('diagnosticLogPayloadIdentifiersInput').checked === true;
  workspace.settings.diagnostics = diagnostics;
  const savePromise = saveWorkspaceSettingsWithRollback(
    previousSettings,
    'Diagnostics privacy settings updated.',
    'Diagnostics privacy setting save failed',
    'Diagnostics Settings Save Failed'
  );
  pendingDiagnosticsSettingsSave = savePromise;
  renderDiagnosticsPrivacyPanel();
  try {
    return await savePromise;
  } finally {
    if (pendingDiagnosticsSettingsSave === savePromise) {
      pendingDiagnosticsSettingsSave = null;
      renderDiagnosticsPrivacyPanel();
    }
  }
}

async function promptTextInput(options = {}) {
  $('textInputModalTitle').textContent = String(options.title || 'Provide value');
  $('textInputModalMessage').textContent = String(options.message || 'Enter a value to continue.');
  $('textInputModalLabel').textContent = String(options.label || 'Value');
  const modal = $('textInputModal');
  const textarea = $('textInputModalInput');
  const singleLine = $('textInputModalSingleLineInput');
  const useSingleLine = options.singleLine === true || options.secret === true;
  const input = useSingleLine ? singleLine : textarea;
  const inactive = useSingleLine ? textarea : singleLine;
  modal.dataset.valueControl = input.id;
  input.hidden = false;
  inactive.hidden = true;
  input.value = String(options.defaultValue || '');
  inactive.value = '';
  if (singleLine) {
    singleLine.type = options.secret === true ? 'password' : 'text';
    singleLine.autocomplete = options.secret === true ? 'new-password' : 'off';
  }
  textarea.rows = options.multiline === true ? 10 : 3;
  input.setAttribute('aria-label', String(options.label || 'Value'));
  if (useSingleLine) {
    CodeEditor.refreshEditor?.(textarea);
  } else {
    textarea.dataset.codeEditor = 'true';
    CodeEditor.enhanceTextarea?.(textarea, { language: options.codeLanguage || 'text' });
    CodeEditor.setLanguage?.(textarea, options.codeLanguage || 'text');
  }
  const result = await showModal('textInputModal', null);
  return result == null ? null : String(result);
}

async function editActiveRunnerCsvVariables() {
  const runner = activeRunner();
  if (!runner) {
    return setStatus('Select a runner before editing CSV variables.');
  }
  collectRunnerFromEditor();
  const result = await promptCsvVariables({
    title: 'Runner CSV variables',
    message: 'Define variables consumed across runner requests and iterations. Use CSV row usage options to reuse, loop, or stop consuming rows.',
    value: runner.csvVariables
  });
  if (!result) {
    return null;
  }
  runner.csvVariables = normalizeCsvVariableData(result);
  markActiveRunnerDirty();
  renderRunnerEditor();
  setStatus(csvVariablesConfigured(runner.csvVariables) ? 'Runner CSV variables updated.' : 'Runner CSV variables cleared.');
  return runner.csvVariables;
}

async function editActivePerformanceCsvVariables() {
  const test = activePerformanceTest();
  if (!test) {
    return setStatus('Select a performance test before editing CSV variables.');
  }
  collectPerformanceTestFromEditor();
  const result = await promptCsvVariables({
    title: 'Performance CSV variables',
    message: 'Define variables consumed across planned performance requests. Use CSV row usage options to reuse, loop, or stop consuming rows.',
    value: test.csvVariables
  });
  if (!result) {
    return null;
  }
  test.csvVariables = normalizeCsvVariableData(result);
  markActivePerformanceDirty();
  renderPerformanceEditor();
  setStatus(csvVariablesConfigured(test.csvVariables) ? 'Performance CSV variables updated.' : 'Performance CSV variables cleared.');
  return test.csvVariables;
}

function toggleActiveRunnerCsvVariables() {
  const runner = activeRunner();
  if (!runner) {
    setStatus('Select a runner before changing CSV variables.');
    return null;
  }
  collectRunnerFromEditor();
  const enabled = normalizeCsvVariableDataDefaultOff(runner.csvVariables).enabled !== false;
  runner.csvVariables = normalizeCsvVariableData({
    ...(runner.csvVariables || {}),
    enabled: !enabled
  });
  markActiveRunnerDirty();
  renderRunnerEditor();
  refreshVariableHighlights();
  setStatus(runner.csvVariables.enabled ? 'Runner CSV variables enabled.' : 'Runner CSV variables disabled.');
  return runner.csvVariables;
}

function toggleActivePerformanceCsvVariables() {
  const test = activePerformanceTest();
  if (!test) {
    setStatus('Select a performance test before changing CSV variables.');
    return null;
  }
  collectPerformanceTestFromEditor();
  const enabled = normalizeCsvVariableDataDefaultOff(test.csvVariables).enabled !== false;
  test.csvVariables = normalizeCsvVariableData({
    ...(test.csvVariables || {}),
    enabled: !enabled
  });
  markActivePerformanceDirty();
  renderPerformanceEditor();
  refreshVariableHighlights();
  setStatus(test.csvVariables.enabled ? 'Performance CSV variables enabled.' : 'Performance CSV variables disabled.');
  return test.csvVariables;
}

function toggleActiveRunnerAuthRefresh() {
  const runner = activeRunner();
  if (!runner) {
    setStatus('Select a runner before changing refreshing auth.');
    return null;
  }
  collectRunnerFromEditor();
  const existing = normalizeAuthRefreshConfig(runner.authRefresh || {});
  if (existing.enabled !== true && !authRefreshRequestHasUrl(existing.request)) {
    runner.authRefresh = existing;
    renderAuthRefreshControls('runner', runner.authRefresh, true);
    openAuthRefreshSettingsPanel('runner');
    setStatus('Create or import an auth request with a URL before turning runner refreshing auth on.');
    return runner.authRefresh;
  }
  runner.authRefresh = normalizeAuthRefreshConfig({
    ...existing,
    enabled: existing.enabled !== true
  });
  const refreshTokenAuthAutoSelected = autoSelectRefreshingAuthRefreshTokenForAccessRequest('runner', runner);
  markActiveRunnerDirty();
  renderRunnerEditor();
  refreshVariableHighlights();
  if (refreshTokenAuthAutoSelected) {
    renderRequestEditor();
  }
  setStatus(runner.authRefresh.enabled ? 'Runner refreshing auth enabled.' : 'Runner refreshing auth disabled.');
  return runner.authRefresh;
}

function toggleActivePerformanceAuthRefresh() {
  const test = activePerformanceTest();
  if (!test) {
    setStatus('Select a performance test before changing refreshing auth.');
    return null;
  }
  collectPerformanceTestFromEditor();
  const previousAuthRefresh = normalizeAuthRefreshConfig(test.authRefresh || {});
  if (previousAuthRefresh.enabled !== true && !authRefreshRequestHasUrl(previousAuthRefresh.request)) {
    test.authRefresh = previousAuthRefresh;
    renderAuthRefreshControls('performance', test.authRefresh, true);
    openAuthRefreshSettingsPanel('performance');
    setStatus('Create or import an auth request with a URL before turning performance refreshing auth on.');
    return test.authRefresh;
  }
  test.authRefresh = normalizeAuthRefreshConfig({
    ...previousAuthRefresh,
    enabled: previousAuthRefresh.enabled !== true
  });
  autoSelectRefreshingAuthRefreshTokenForAccessRequest('performance', test);
  autoSelectRefreshingAuthAccessTokenForOwner('performance', test, previousAuthRefresh, test.authRefresh);
  syncPerformanceRefreshingAuthAccessToken(test, test.authRefresh);
  markActivePerformanceDirty();
  renderPerformanceEditor();
  refreshVariableHighlights();
  setStatus(test.authRefresh.enabled ? 'Performance refreshing auth enabled.' : 'Performance refreshing auth disabled.');
  return test.authRefresh;
}

async function promptCsvVariables(options = {}) {
  configureCsvVariablesModal(options);
  const result = await showModal('csvVariablesModal', null);
  resetCsvVariablesModal();
  return result == null ? null : normalizeCsvVariableData(result);
}

function configureCsvVariablesModal(options = {}) {
  const value = normalizeCsvVariableData(options.value || {});
  const hasFile = Boolean(String(value.filePath || '').trim());
  const hasInlineRows = Boolean(String(value.values || '').trim());
  $('csvVariablesModalTitle').textContent = String(options.title || 'CSV variables');
  $('csvVariablesModalMessage').textContent = String(options.message || 'Define a comma-separated schema and provide CSV rows for request executions.');
  $('csvVariablesSchemaInput').value = value.schema;
  const valuesInput = $('csvVariablesValuesInput');
  if (valuesInput) {
    valuesInput.value = value.values;
    refreshCodeEditorIfTextarea(valuesInput);
  }
  const reuseFirstRowInput = $('csvVariablesReuseFirstRowInput');
  if (reuseFirstRowInput) {
    reuseFirstRowInput.checked = value.reuseFirstRow === true;
  }
  const loopRowsInput = $('csvVariablesLoopRowsInput');
  if (loopRowsInput) {
    loopRowsInput.checked = value.loopRows === true;
  }
  const continueWithoutRowsInput = $('csvVariablesContinueWithoutRowsInput');
  if (continueWithoutRowsInput) {
    continueWithoutRowsInput.checked = value.continueWithoutRows === true;
  }
  const modal = $('csvVariablesModal');
  modal.dataset.enabled = value.enabled === false ? 'false' : 'true';
  modal.dataset.filePath = value.filePath;
  modal.dataset.sourceName = value.sourceName;
  modal.dataset.activeSource = value.activeSource;
  modal.dataset.valuesExpanded = value.activeSource === 'inline' || (!hasFile && hasInlineRows) ? 'true' : 'false';
  pendingCsvVariablesFile = null;
  pendingCsvVariablesFilePath = '';
  hideCsvVariablesImportChoice();
  renderCsvVariablesError('');
  syncCsvVariablesModalUi();
}

function resetCsvVariablesModal() {
  pendingCsvVariablesFile = null;
  pendingCsvVariablesFilePath = '';
  hideCsvVariablesImportChoice();
  const input = $('csvVariablesFileInput');
  if (input) {
    input.value = '';
  }
}

function confirmCsvVariablesModal() {
  if (pendingCsvVariablesFile) {
    renderCsvVariablesError('Choose whether to load the selected CSV into the editor or keep it as a file reference.');
    return;
  }
  const value = currentCsvVariablesModalValue();
  const hasValues = String(value.values || '').trim();
  const hasFile = String(value.filePath || '').trim();
  try {
    if (hasValues || hasFile) {
      const names = parseCsvVariableSchema(value.schema);
      if (!names.length) {
        throw new Error('CSV variable schema is required when CSV values or a CSV file are configured.');
      }
    }
    if (value.activeSource === 'inline' && hasValues) {
      csvVariablesToIterationRows(value, value.values, { requiredRows: value.reuseFirstRow === true ? 1 : 0 });
    }
  } catch (error) {
    renderCsvVariablesError(error.message || String(error));
    return;
  }
  resolveActiveModal(normalizeCsvVariableData(value));
}

function csvVariablesRowModeChanged(mode) {
  const reuseFirstRowInput = $('csvVariablesReuseFirstRowInput');
  const loopRowsInput = $('csvVariablesLoopRowsInput');
  const continueWithoutRowsInput = $('csvVariablesContinueWithoutRowsInput');
  if (mode === 'reuse' && reuseFirstRowInput?.checked === true) {
    if (loopRowsInput) {
      loopRowsInput.checked = false;
    }
    if (continueWithoutRowsInput) {
      continueWithoutRowsInput.checked = false;
    }
  }
  if (mode === 'loop' && loopRowsInput?.checked === true) {
    if (reuseFirstRowInput) {
      reuseFirstRowInput.checked = false;
    }
    if (continueWithoutRowsInput) {
      continueWithoutRowsInput.checked = false;
    }
  }
  if (mode === 'continue' && continueWithoutRowsInput?.checked === true) {
    if (reuseFirstRowInput) {
      reuseFirstRowInput.checked = false;
    }
    if (loopRowsInput) {
      loopRowsInput.checked = false;
    }
  }
}

function toggleCsvVariablesValuesPanel() {
  const panel = $('csvVariablesValuesPanel');
  setCsvVariablesValuesExpanded(panel?.hidden !== false);
}

function setCsvVariablesValuesExpanded(expanded) {
  const modal = $('csvVariablesModal');
  if (modal) {
    modal.dataset.valuesExpanded = expanded ? 'true' : 'false';
  }
  syncCsvVariablesModalUi();
}

function selectCsvVariablesSource(source) {
  const modal = $('csvVariablesModal');
  if (!modal || !csvVariablesSourceAvailable(source)) {
    return;
  }
  modal.dataset.activeSource = source;
  if (source === 'inline') {
    modal.dataset.valuesExpanded = 'true';
  } else if (source === 'file') {
    modal.dataset.valuesExpanded = 'false';
  }
  syncCsvVariablesModalUi();
}

function csvVariablesSourceAvailable(source) {
  if (source === 'file') {
    return Boolean(String($('csvVariablesModal')?.dataset?.filePath || '').trim());
  }
  if (source === 'inline') {
    return Boolean(String($('csvVariablesValuesInput')?.value || '').trim());
  }
  return false;
}

function csvVariablesValuesInputChanged() {
  const values = $('csvVariablesValuesInput')?.value || '';
  const modal = $('csvVariablesModal');
  if (modal) {
    if (String(values).trim() && !String(modal.dataset.activeSource || '').trim()) {
      modal.dataset.activeSource = 'inline';
    } else if (!String(values).trim() && modal.dataset.activeSource === 'inline') {
      modal.dataset.activeSource = String(modal.dataset.filePath || '').trim() ? 'file' : '';
    }
  }
  syncCsvVariablesModalUi();
}

function currentCsvVariablesModalValue() {
  const modal = $('csvVariablesModal');
  const reuseFirstRow = $('csvVariablesReuseFirstRowInput')?.checked === true;
  const loopRows = !reuseFirstRow && $('csvVariablesLoopRowsInput')?.checked === true;
  const filePath = modal?.dataset?.filePath || '';
  const values = $('csvVariablesValuesInput')?.value || '';
  return {
    schema: $('csvVariablesSchemaInput')?.value || '',
    values,
    filePath,
    sourceName: modal?.dataset?.sourceName || '',
    activeSource: normalizeCsvVariablesModalActiveSource(modal?.dataset?.activeSource || '', values, filePath),
    enabled: modal?.dataset?.enabled !== 'false',
    reuseFirstRow,
    loopRows,
    continueWithoutRows: !reuseFirstRow && !loopRows && $('csvVariablesContinueWithoutRowsInput')?.checked === true
  };
}

function normalizeCsvVariablesModalActiveSource(source, values, filePath) {
  const hasValues = Boolean(String(values || '').trim());
  const hasFile = Boolean(String(filePath || '').trim());
  if (source === 'inline' && hasValues) {
    return 'inline';
  }
  if (source === 'file' && hasFile) {
    return 'file';
  }
  if (hasFile) {
    return 'file';
  }
  if (hasValues) {
    return 'inline';
  }
  return '';
}

function importCsvVariablesFile() {
  renderCsvVariablesError('');
  $('csvVariablesFileInput')?.click?.();
}

function csvVariablesFileSelected() {
  const input = $('csvVariablesFileInput');
  const file = input?.files?.[0] || null;
  if (!file) {
    return;
  }
  pendingCsvVariablesFile = file;
  pendingCsvVariablesFilePath = '';
  const choice = $('csvVariablesImportChoice');
  const message = $('csvVariablesImportChoiceMessage');
  if (message) {
    const name = file.name || 'CSV file';
    message.textContent = `Load "${name}" into the CSV values editor? Keep a file reference for large files.`;
  }
  if (choice) {
    choice.hidden = false;
  }
  setCsvVariablesValuesExpanded(false);
  renderCsvVariablesError('');
  syncCsvVariablesModalUi('CSV file selected. Choose how to use it.');
  input.value = '';
}

async function loadPendingCsvVariablesFile() {
  const file = pendingCsvVariablesFile;
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const valuesInput = $('csvVariablesValuesInput');
    if (valuesInput) {
      valuesInput.value = text;
      refreshCodeEditorIfTextarea(valuesInput);
    }
    const modal = $('csvVariablesModal');
    modal.dataset.filePath = '';
    modal.dataset.sourceName = file.name || '';
    modal.dataset.activeSource = 'inline';
    pendingCsvVariablesFile = null;
    pendingCsvVariablesFilePath = '';
    hideCsvVariablesImportChoice();
    setCsvVariablesValuesExpanded(true);
    renderCsvVariablesError('');
    syncCsvVariablesModalUi('CSV file loaded into the inline editor.');
  } catch (error) {
    renderCsvVariablesError(`CSV file could not be loaded: ${error.message || String(error)}`);
  }
}

async function keepPendingCsvVariablesFile() {
  const file = pendingCsvVariablesFile;
  if (!file) {
    return;
  }
  const contentBase64 = typeof fileToBase64 === 'function' ? await fileToBase64(file) : '';
  const binding = await storeMainOwnedLocalFile({
    contentBase64,
    fileName: file.name || 'variables.csv',
    name: file.name || 'variables.csv'
  }, {
    contentKind: 'csv',
    contentType: 'text/csv',
    fileName: file.name || 'variables.csv',
    purpose: 'csv-variables'
  });
  if (!binding?.source) {
    renderCsvVariablesError('PostMeter could not store that CSV file reference. Load it into the editor instead.');
    return;
  }
  const modal = $('csvVariablesModal');
  modal.dataset.filePath = binding.source;
  modal.dataset.sourceName = binding.fileName || file.name || fileNameFromLocalPath(binding.source);
  modal.dataset.activeSource = 'file';
  pendingCsvVariablesFile = null;
  pendingCsvVariablesFilePath = '';
  hideCsvVariablesImportChoice();
  setCsvVariablesValuesExpanded(false);
  renderCsvVariablesError('');
  syncCsvVariablesModalUi();
}

function clearCsvVariablesFile() {
  clearCsvVariablesFileReference();
  hideCsvVariablesImportChoice();
  renderCsvVariablesError('');
  syncCsvVariablesModalUi('CSV file reference cleared.');
}

function clearCsvVariablesFileReference() {
  const modal = $('csvVariablesModal');
  if (modal) {
    modal.dataset.filePath = '';
    modal.dataset.sourceName = '';
    if (modal.dataset.activeSource === 'file') {
      modal.dataset.activeSource = String($('csvVariablesValuesInput')?.value || '').trim() ? 'inline' : '';
    }
  }
  pendingCsvVariablesFile = null;
  pendingCsvVariablesFilePath = '';
}

function hideCsvVariablesImportChoice() {
  const choice = $('csvVariablesImportChoice');
  if (choice) {
    choice.hidden = true;
  }
}

function syncCsvVariablesModalUi(statusMessage = '') {
  const modal = $('csvVariablesModal');
  if (!modal) {
    return;
  }
  const value = currentCsvVariablesModalValue();
  const hasFile = Boolean(String(value.filePath || '').trim());
  const hasPendingFile = Boolean(pendingCsvVariablesFile);
  const rawValues = $('csvVariablesValuesInput')?.value || '';
  const hasInlineRows = Boolean(String(rawValues).trim());
  const activeSource = value.activeSource;
  modal.dataset.activeSource = activeSource;
  const valuesPanel = $('csvVariablesValuesPanel');
  const valuesToggle = $('csvVariablesValuesToggle');
  const valuesExpanded = modal.dataset.valuesExpanded === 'true';
  if (valuesPanel) {
    valuesPanel.hidden = !valuesExpanded;
  }
  if (valuesToggle) {
    valuesToggle.setAttribute('aria-expanded', valuesExpanded ? 'true' : 'false');
  }
  modal.classList?.toggle?.('csv-values-expanded', valuesExpanded);
  const summary = $('csvVariablesValuesSummary');
  if (summary) {
    const rowCount = csvVariableTextRowCount(rawValues);
    summary.textContent = hasInlineRows ? `${rowCount} inline row${rowCount === 1 ? '' : 's'}` : 'No inline rows';
  }
  updateCsvVariablesSourceButton('file', hasFile, activeSource === 'file');
  updateCsvVariablesSourceButton('inline', hasInlineRows, activeSource === 'inline');
  const clearFileButton = $('clearCsvVariablesFileButton');
  if (clearFileButton) {
    clearFileButton.disabled = !hasFile && !hasPendingFile;
  }
  updateCsvVariablesFileStatus(statusMessage);
}

function updateCsvVariablesSourceButton(source, available, active) {
  const button = source === 'file' ? $('csvVariablesFileSourceButton') : $('csvVariablesInlineSourceButton');
  if (!button) {
    return;
  }
  button.disabled = !available;
  button.dataset.state = !available ? 'empty' : active ? 'active' : 'available';
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function csvVariableTextRowCount(text) {
  return String(text || '').split(/\r?\n/).filter((line) => line.trim()).length;
}

function updateCsvVariablesFileStatus(message = '') {
  const status = $('csvVariablesFileStatus');
  if (!status) {
    return;
  }
  const value = currentCsvVariablesModalValue();
  const hasPendingFile = Boolean(pendingCsvVariablesFile);
  status.classList?.toggle?.('active', Boolean(value.filePath));
  status.classList?.toggle?.('pending', hasPendingFile);
  if (message) {
    status.textContent = message;
    return;
  }
  if (hasPendingFile) {
    const name = pendingCsvVariablesFile.name || 'CSV file';
    status.textContent = `Pending import: ${name}`;
    return;
  }
  if (value.filePath) {
    const fileLabel = value.sourceName || fileNameFromLocalPath(value.filePath) || value.filePath;
    status.textContent = `${value.activeSource === 'file' ? 'Using' : 'Available'} CSV file: ${fileLabel}`;
  } else if (value.sourceName && String(value.values || '').trim()) {
    status.textContent = `Loaded into inline editor: ${value.sourceName}`;
  } else {
    status.textContent = 'No imported CSV file is active.';
  }
}

function renderCsvVariablesError(message) {
  const error = $('csvVariablesError');
  if (!error) {
    return;
  }
  error.textContent = String(message || '');
  error.hidden = !message;
}

async function confirmActionModal(options = {}) {
  $('confirmActionModalTitle').textContent = String(options.title || 'Confirm action');
  $('confirmActionModalMessage').textContent = String(options.message || 'Continue?');
  const confirmButton = $('confirmActionButton');
  confirmButton.textContent = String(options.confirmLabel || 'Continue');
  confirmButton.disabled = options.disableConfirm === true;
  confirmButton.classList.toggle('danger-button', options.danger === true);
  confirmButton.classList.toggle('primary', options.danger !== true);
  $('cancelConfirmActionButton').textContent = String(options.cancelLabel || 'Cancel');
  try {
    return await showModal('confirmActionModal', false) === true;
  } finally {
    confirmButton.disabled = false;
  }
}

async function confirmRuntimeResultStoreCapacity(kind, payload, config = {}) {
  const api = kind === 'performance'
    ? window.postmeter?.performance?.estimateResultStore
    : window.postmeter?.runner?.estimateResultStore;
  if (typeof api !== 'function') {
    return true;
  }
  let estimate;
  try {
    estimate = kind === 'performance'
      ? await api(payload)
      : await api(payload, config);
  } catch (error) {
    const message = error.message || String(error);
    return await confirmActionModal({
      title: 'Storage Estimate Unavailable',
      message: `PostMeter could not estimate the temporary result database size before starting this run.\n\n${message}\n\nContinue?`,
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel'
    });
  }
  if (!estimate?.shouldWarn) {
    return true;
  }
  const cannotContinue = estimate.canContinue === false || estimate.exceedsAvailable === true;
  const available = estimate.effectiveAvailableBytes == null ? 'unknown' : formatBytes(estimate.effectiveAvailableBytes);
  const current = Number(estimate.existingResultStoreBytes || 0) > 0
    ? `\nCurrent temp result file that will be replaced: ${formatBytes(estimate.existingResultStoreBytes)}.`
    : '';
  const margin = estimate.warningMarginBytes ? formatBytes(estimate.warningMarginBytes) : '1.00 GB';
  const action = cannotContinue
    ? 'Free disk space or reduce result capture settings before running this test.'
    : 'The run can continue, but exporting or keeping all optional captures may consume most of the available disk space.';
  return await confirmActionModal({
    title: cannotContinue ? 'Insufficient Disk Space' : 'Large Result File Warning',
    message: [
      `PostMeter estimates this ${kind === 'performance' ? 'Performance' : 'Runner'} run will create a temporary SQLite result database of about ${formatBytes(estimate.estimatedBytes)}.`,
      `Effective available space for the temp result file: ${available}.${current}`,
      `PostMeter warns when the estimate is within ${margin} of available space.`,
      action
    ].filter(Boolean).join('\n\n'),
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
    disableConfirm: cannotContinue
  });
}

function showNotificationModal(title, message) {
  pendingNotificationModals.push({
    title: String(title || 'PostMeter'),
    message: String(message || '')
  });
  void flushNotificationModalQueue();
}

async function flushNotificationModalQueue() {
  if (notificationModalActive || state.activeModalResolver || !pendingNotificationModals.length) {
    return;
  }
  const notification = pendingNotificationModals.shift();
  notificationModalActive = true;
  $('notificationModalTitle').textContent = String(notification.title || 'PostMeter');
  $('notificationModalMessage').textContent = String(notification.message || '');
  try {
    await showModal('notificationModal', true);
  } finally {
    notificationModalActive = false;
    void flushNotificationModalQueue();
  }
}

async function addSandboxPackageFromPrompt(defaultSpecifier = '') {
  ensureSettings();
  const firstMissing = sandboxPackageStatusRows().find((item) => item.pinned && !item.cached)?.specifier || '';
  const specifier = String(await promptTextInput({
    title: 'Review sandbox package',
    message: 'Enter the imported package specifier to add to the reviewed sandbox cache.',
    label: 'Package specifier',
    defaultValue: defaultSpecifier || firstMissing || 'npm:package@1.0.0'
  }) || '').trim();
  if (!specifier) {
    return;
  }
  if (!SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier)) {
    setStatus('Package review requires @team/package, npm:package@version, npm:@scope/package@version, or jsr:@scope/package@version.');
    return;
  }
  const source = String(await promptTextInput({
    title: 'Review package source',
    message: `Paste reviewed source for ${specifier}. This source becomes available to imported scripts that require the package.`,
    label: 'Reviewed source',
    defaultValue: '',
    multiline: true,
    codeLanguage: 'javascript'
  }) || '');
  if (!source.trim()) {
    return;
  }
  const dependenciesText = String(await promptTextInput({
    title: 'Review package dependencies',
    message: 'Enter reviewed dependency specifiers, separated by commas.',
    label: 'Dependencies',
    defaultValue: ''
  }) || '');
  const dependencies = dependenciesText.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 32);
  const integrity = await sha256Integrity(source);
  const previousSettings = cloneWorkspaceSettings();
  const next = normalizeSandboxPackageCache([
    ...workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier),
    { dependencies, integrity, source, specifier }
  ]);
  workspace.settings.sandbox.packageCache = next;
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    `Reviewed package ${specifier} added to the sandbox cache.`,
    'Reviewed package save failed',
    'Sandbox Package Save Failed'
  );
}

async function fetchSandboxPackageFromPrompt(defaultSpecifier = '') {
  ensureSettings();
  const firstMissing = sandboxPackageStatusRows().find((item) => item.pinned && !item.cached)?.specifier || '';
  const specifier = String(await promptTextInput({
    title: 'Fetch package for review',
    message: 'Enter the package specifier to fetch into the reviewed sandbox cache.',
    label: 'Package specifier',
    defaultValue: defaultSpecifier || firstMissing || 'npm:package@1.0.0'
  }) || '').trim();
  if (!specifier) {
    return;
  }
  if (!SANDBOX_REVIEWED_PACKAGE_PATTERN.test(specifier)) {
    setStatus('Package fetch requires @team/package, npm:package@version, npm:@scope/package@version, or jsr:@scope/package@version.');
    return;
  }
  const fetchOptions = {};
  if (specifier.startsWith('@')) {
    const sourceUrl = String(await promptTextInput({
      title: 'Package source URL',
      message: `Enter the maintainer-reviewed HTTPS source URL for ${specifier}.`,
      label: 'HTTPS source URL',
      defaultValue: ''
    }) || '').trim();
    if (!sourceUrl) {
      return;
    }
    fetchOptions.sourceUrl = sourceUrl;
  }
  const fetchPackage = window.__postmeterFetchSandboxPackage || window.postmeter?.sandboxPackages?.fetch;
  if (typeof fetchPackage !== 'function') {
    setStatus('Package fetch is not available in this runtime.');
    return;
  }
  setStatus(`Fetching ${specifier} for review...`);
  let fetched;
  try {
    fetched = await fetchPackage(specifier, fetchOptions);
  } catch (error) {
    setStatus(`Package fetch failed: ${error.message || String(error)}`);
    return;
  }
  const source = String(await promptTextInput({
    title: 'Review fetched package source',
    message: `Review or edit the fetched source for ${specifier} before it is cached.`,
    label: 'Reviewed source',
    defaultValue: fetched.source || '',
    multiline: true,
    codeLanguage: 'javascript'
  }) || '');
  if (!source.trim()) {
    setStatus(`Fetched package ${specifier} was not added.`);
    return;
  }
  const sourceChanged = source !== String(fetched.source || '');
  const dependencyDefault = Array.isArray(fetched.dependencies) ? fetched.dependencies.join(', ') : '';
  const dependenciesText = String(await promptTextInput({
    title: 'Review package dependencies',
    message: 'Confirm reviewed dependency specifiers, separated by commas.',
    label: 'Dependencies',
    defaultValue: dependencyDefault
  }) ?? dependencyDefault);
  const dependencies = dependenciesText.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 32);
  const integrity = sourceChanged ? await sha256Integrity(source) : fetched.integrity;
  const previousSettings = cloneWorkspaceSettings();
  const next = normalizeSandboxPackageCache([
    ...workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier),
    {
      dependencyAliases: sourceChanged ? {} : (fetched.dependencyAliases || {}),
      dependencies,
      entrypoint: fetched.entrypoint || '',
      fetchedAt: fetched.fetchedAt || '',
      files: sourceChanged ? [] : (fetched.files || []),
      integrity,
      maxExportKeys: fetched.maxExportKeys,
      packageDependencies: fetched.packageDependencies || [],
      packageIntegrity: sourceChanged ? '' : (fetched.packageIntegrity || ''),
      packageJson: sourceChanged ? {} : (fetched.packageJson || {}),
      packageName: fetched.packageName || '',
      packageVersion: fetched.packageVersion || '',
      registry: fetched.registry || '',
      reviewedAt: new Date().toISOString(),
      source,
      sourceUrl: fetched.sourceUrl || '',
      specifier
    }
  ]);
  workspace.settings.sandbox.packageCache = next;
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    `Fetched package ${specifier} added to the reviewed sandbox cache.`,
    'Fetched package save failed',
    'Sandbox Package Save Failed'
  );
}

async function sha256Integrity(source) {
  const bytes = new TextEncoder().encode(String(source || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const binary = String.fromCharCode(...new Uint8Array(digest));
  return `sha256-${btoa(binary)}`;
}

async function removeSandboxPackage(specifier) {
  ensureSettings();
  if (!(await confirmActionModal({
    title: 'Remove reviewed package?',
    message: `Remove reviewed package ${specifier} from the sandbox cache? Imported scripts that require it may fail until it is reviewed again.`,
    confirmLabel: 'Remove Package',
    danger: true
  }))) {
    setStatus('Reviewed package removal cancelled.');
    return;
  }
  const previousSettings = structuredClone(workspace.settings);
  workspace.settings.sandbox.packageCache = workspace.settings.sandbox.packageCache.filter((item) => item.specifier !== specifier);
  try {
    await saveWorkspace(false, { scope: 'settings' });
    renderWorkspacePanel();
    setStatus(`Reviewed package ${specifier} removed from the sandbox cache.`);
  } catch (error) {
    workspace.settings = previousSettings;
    renderWorkspacePanel();
    setStatus(`Reviewed package removal failed: ${error.message || String(error)}`);
  }
}

function refreshSandboxPackageStatus() {
  ensureSettings();
  renderWorkspacePanel();
  const statuses = sandboxPackageStatusRows();
  const missing = statuses.filter((item) => !item.cached || !item.pinned);
  setStatus(`${workspace.settings.sandbox.packageCache.length} reviewed package${workspace.settings.sandbox.packageCache.length === 1 ? '' : 's'} cached. ${missing.length} package reference${missing.length === 1 ? '' : 's'} need review.`);
}

async function bindSandboxFileFromPrompt(defaultSource = '') {
  ensureSettings();
  const firstMissing = sandboxFileBindingStatusRows().find((item) => !item.bound)?.source || '';
  const source = String(await promptTextInput({
    title: 'Bind imported file',
    message: 'Enter the imported Postman file reference that should be bound to a local file.',
    label: 'Imported file reference',
    defaultValue: defaultSource || firstMissing || ''
  }) || '').trim();
  if (!source) {
    return;
  }
  const reference = sandboxFileReferencesForWorkspace().find((item) => item.source === source) || { source, mode: 'file' };
  const chooseFileBinding = window.__postmeterChooseFileBinding || window.postmeter?.fileBindings?.choose;
  if (!chooseFileBinding) {
    setStatus('Imported file binding is unavailable in this runtime.');
    return;
  }
  const result = await chooseFileBinding({
      contentType: reference.contentType || '',
      key: reference.key || '',
      mode: reference.mode || 'file',
      source
  });
  if (result?.cancelled) {
    return;
  }
  const binding = result?.binding;
  if (!binding?.source) {
    setStatus('Imported file binding save failed: no binding was returned.');
    return;
  }
  const previousSettings = cloneWorkspaceSettings();
  const next = normalizeSandboxFileBindings([
    ...workspace.settings.sandbox.fileBindings.filter((item) => item.source !== source),
    binding
  ]);
  workspace.settings.sandbox.fileBindings = next;
  await saveWorkspaceSettingsWithRollback(
    previousSettings,
    `Imported file binding added for ${source}.`,
    'Imported file binding save failed',
    'Sandbox File Binding Save Failed'
  );
}

async function removeSandboxFileBinding(source) {
  ensureSettings();
  if (!(await confirmActionModal({
    title: 'Remove imported file binding?',
    message: `Remove imported file binding for ${source}? Scripts and requests that use this attachment will fail until it is bound again.`,
    confirmLabel: 'Remove Binding',
    danger: true
  }))) {
    setStatus('Imported file binding removal cancelled.');
    return;
  }
  const previousSettings = structuredClone(workspace.settings);
  workspace.settings.sandbox.fileBindings = workspace.settings.sandbox.fileBindings.filter((item) => item.source !== source);
  try {
    await saveWorkspace(false, { scope: 'settings' });
    renderWorkspacePanel();
    setStatus(`Imported file binding removed for ${source}.`);
  } catch (error) {
    workspace.settings = previousSettings;
    renderWorkspacePanel();
    setStatus(`Imported file binding removal failed: ${error.message || String(error)}`);
  }
}

function refreshSandboxFileBindings() {
  ensureSettings();
  renderWorkspacePanel();
  const statuses = sandboxFileBindingStatusRows();
  const bound = statuses.filter((item) => item.bound);
  const missing = statuses.filter((item) => !item.bound);
  setStatus(`${bound.length} imported file attachment${bound.length === 1 ? '' : 's'} bound. ${missing.length} attachment reference${missing.length === 1 ? '' : 's'} need local binding.`);
}

async function refreshVaultMetadata() {
  const vault = vaultApi();
  if (!vault?.metadata) {
    setStatus('Vault metadata is unavailable in this runtime.');
    return;
  }
  const metadataWorkspaceId = activeWorkspaceId || '';
  try {
    const metadata = await vault.metadata();
    if ((activeWorkspaceId || '') !== metadataWorkspaceId) {
      return;
    }
    lastVaultMetadata = metadata;
    lastVaultMetadataWorkspaceId = metadataWorkspaceId;
    renderWorkspacePanel();
    setStatus('Vault metadata refreshed.');
  } catch (error) {
    if ((activeWorkspaceId || '') !== metadataWorkspaceId) {
      return;
    }
    const message = error.message || String(error);
    setStatus(`Vault metadata refresh failed: ${message}`);
    notifyUser('Vault Metadata Failed', message);
  }
}

async function bindVaultSecretFromPrompt() {
  const vault = vaultApi();
  if (!vault?.bindSecret) {
    setStatus('Vault binding is unavailable in this runtime.');
    return;
  }
  const key = String(await promptTextInput({
    title: 'Bind vault secret',
    message: 'Enter the vault secret key to bind locally for this workspace.',
    label: 'Secret key',
    defaultValue: '',
    singleLine: true
  }) || '').trim();
  if (!key) {
    return;
  }
  const value = await promptTextInput({
    title: 'Bind vault secret value',
    message: `Enter the local value for vault secret "${key}". The value is sent only to the parent-side encrypted vault binding operation.`,
    label: 'Secret value',
    defaultValue: '',
    secret: true
  });
  if (value == null) {
    return;
  }
  try {
    await vault.bindSecret(key, value);
    await refreshVaultMetadata();
    setStatus(`Vault secret ${key} bound locally.`);
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault secret binding failed: ${message}`);
    notifyUser('Vault Binding Failed', message);
  }
}

async function unsetVaultSecret(key) {
  const vault = vaultApi();
  if (!vault?.unsetSecret) {
    setStatus('Vault secret removal is unavailable in this runtime.');
    return;
  }
  if (!(await confirmActionModal({
    title: 'Remove vault secret?',
    message: `Remove vault secret "${key}" from this workspace?`,
    confirmLabel: 'Remove Secret',
    danger: true
  }))) {
    return;
  }
  try {
    await vault.unsetSecret(key);
    await refreshVaultMetadata();
    setStatus(`Vault secret ${key} removed.`);
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault secret removal failed: ${message}`);
    notifyUser('Vault Removal Failed', message);
  }
}

async function resetVaultFromWorkspacePanel() {
  const vault = vaultApi();
  if (!vault?.reset) {
    setStatus('Vault reset is unavailable in this runtime.');
    return;
  }
  if (!(await confirmActionModal({
    title: 'Reset vault?',
    message: 'Reset the local encrypted vault for this workspace? This removes stored local secret bindings.',
    confirmLabel: 'Reset Vault',
    danger: true
  }))) {
    return;
  }
  try {
    await vault.reset();
    lastVaultMetadata = { audit: [], available: true, secrets: [] };
    lastVaultMetadataWorkspaceId = activeWorkspaceId || '';
    renderWorkspacePanel();
    setStatus('Vault reset.');
  } catch (error) {
    const message = error.message || String(error);
    setStatus(`Vault reset failed: ${message}`);
    notifyUser('Vault Reset Failed', message);
  }
}

function vaultApi() {
  return window.__postmeterVault || window.postmeter?.vault || {};
}
