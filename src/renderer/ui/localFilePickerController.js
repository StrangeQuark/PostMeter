function canResolveLocalFilePaths() {
  return typeof window.postmeter?.files?.pathForFile === 'function';
}

function bindLocalFilePickerUi() {
  const fileInput = $('filePickerInput');
  const browseButton = $('filePickerBrowseButton');
  const usePathButton = $('filePickerUsePathButton');
  const manualPathInput = $('filePickerManualPathInput');
  const cancelButton = $('filePickerCancelButton');
  const closeButton = $('filePickerCloseButton');
  const dropZone = $('filePickerDropZone');
  const sourceChooseButton = $('fileSourceChooseButton');

  browseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    fileInput?.click?.();
  });
  usePathButton?.addEventListener('click', useManualPathFromFilePicker);
  manualPathInput?.addEventListener('input', clearFilePickerError);
  manualPathInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      useManualPathFromFilePicker();
    }
  });
  cancelButton?.addEventListener('click', () => resolveActiveModal(null));
  closeButton?.addEventListener('click', () => resolveActiveModal(null));
  fileInput?.addEventListener('change', () => {
    void selectLocalFileFromPicker(fileInput.files?.[0] || null);
  });
  dropZone?.addEventListener('click', () => fileInput?.click?.());
  dropZone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click?.();
    }
  });
  for (const eventName of ['dragenter', 'dragover']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add('is-dragover');
    });
  }
  for (const eventName of ['dragleave', 'dragend']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove('is-dragover');
      }
    });
  }
  dropZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('is-dragover');
    void selectLocalFileFromPicker(event.dataTransfer?.files?.[0] || null);
  });
  sourceChooseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void chooseFileForActiveSourceInput();
  });

  configureLocalFileSourceInput($('binaryBodySourceInput'), '', 'binary');
  configureLocalFileSourceInput($('performanceBinaryBodySourceInput'), 'performance', 'binary');
  bindRequestImportModalUi();
  bindRequestExportPickerModalUi();
  bindRequestExportModalUi();
  document.addEventListener('click', closeFileSourceMenu);
  window.addEventListener('blur', closeFileSourceMenu);
  window.addEventListener('resize', closeFileSourceMenu);
}

function configureFilePickerModal(options = {}) {
  $('filePickerTitle').textContent = options.title || 'Choose file';
  $('filePickerMessage').textContent = options.message || 'Drop a file here or choose a file from this computer.';
  const fileInput = $('filePickerInput');
  fileInput.value = '';
  fileInput.accept = options.accept || '';
  const manualPathField = $('filePickerManualPathField');
  const manualPathInput = $('filePickerManualPathInput');
  const allowManualPath = options.allowManualPath !== false;
  if (manualPathField) {
    manualPathField.hidden = !allowManualPath;
  }
  if (manualPathInput) {
    manualPathInput.value = options.defaultPath || '';
    manualPathInput.placeholder = options.manualPathPlaceholder || '/path/to/file';
  }
  clearFilePickerError();
  const dropZone = $('filePickerDropZone');
  dropZone.classList.remove('is-dragover');
  const title = dropZone.querySelector('strong');
  const detail = dropZone.querySelector('span');
  if (title) {
    title.textContent = options.dropTitle || 'Drop file here';
  }
  if (detail) {
    detail.textContent = options.dropDetail || 'or choose a file from this computer.';
  }
}

async function showLocalFilePicker(options = {}) {
  if (!canResolveLocalFilePaths() && options.allowManualPath === false) {
    return null;
  }
  activeFilePickerOptions = options;
  configureFilePickerModal(options);
  const selection = await showModal('filePickerModal', null);
  resetFilePickerModal();
  activeFilePickerOptions = null;
  return selection;
}

function resetFilePickerModal() {
  const fileInput = $('filePickerInput');
  if (fileInput) {
    fileInput.value = '';
    fileInput.accept = '';
  }
  const manualPathInput = $('filePickerManualPathInput');
  if (manualPathInput) {
    manualPathInput.value = '';
    manualPathInput.placeholder = '/path/to/file';
  }
  const manualPathField = $('filePickerManualPathField');
  if (manualPathField) {
    manualPathField.hidden = false;
  }
  $('filePickerDropZone')?.classList.remove('is-dragover');
  clearFilePickerError();
}

function useManualPathFromFilePicker() {
  const input = $('filePickerManualPathInput');
  const filePath = String(input?.value || '').trim();
  if (!filePath) {
    renderFilePickerError(activeFilePickerOptions?.manualPathRequiredMessage || 'Enter a local file path or choose a file.');
    input?.focus?.();
    return;
  }
  resolveActiveModal({
    name: fileNameFromLocalPath(filePath),
    path: filePath,
    picker: activeFilePickerOptions?.kind || 'file',
    manualPath: true
  });
}

async function selectLocalFileFromPicker(file) {
  if (!file) {
    return;
  }
  const filePath = localPathForFile(file);
  if (!filePath) {
    renderFilePickerError('PostMeter could not read a local path for that file. Use the manual path field.');
    return;
  }
  resolveActiveModal({
    name: file.name || fileNameFromLocalPath(filePath),
    path: filePath,
    picker: activeFilePickerOptions?.kind || 'file'
  });
}

function localPathForFile(file) {
  try {
    const resolved = window.postmeter?.files?.pathForFile?.(file);
    if (typeof resolved === 'string' && resolved.trim()) {
      return resolved.trim();
    }
  } catch {
    return '';
  }
  return typeof file?.path === 'string' ? file.path.trim() : '';
}

function clearFilePickerError() {
  const error = $('filePickerError');
  if (!error) {
    return;
  }
  error.textContent = '';
  error.hidden = true;
}

function renderFilePickerError(message) {
  const error = $('filePickerError');
  if (!error) {
    return;
  }
  error.textContent = String(message || 'Choose a file to continue.');
  error.hidden = false;
}

function bindRequestImportModalUi() {
  const textInput = $('requestImportTextInput');
  const fileInput = $('requestImportFileInput');
  const dropZone = $('requestImportDropZone');
  const browseButton = $('requestImportBrowseButton');
  const cancelButton = $('cancelRequestImportButton');
  const closeButton = $('requestImportCloseButton');
  const confirmButton = $('confirmRequestImportButton');
  browseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    fileInput?.click?.();
  });
  cancelButton?.addEventListener('click', () => resolveActiveModal(null));
  closeButton?.addEventListener('click', () => resolveActiveModal(null));
  confirmButton?.addEventListener('click', () => {
    const text = String(textInput?.value || '').trim();
    const filePath = selectedRequestImportFilePath;
    if (!text && !filePath) {
      renderRequestImportError('Paste request text or choose a request file.');
      return;
    }
    resolveActiveModal({ text, filePath });
  });
  textInput?.addEventListener('input', updateRequestImportConfirmState);
  fileInput?.addEventListener('change', () => {
    void selectRequestImportFile(fileInput.files?.[0] || null);
  });
  dropZone?.addEventListener('click', () => fileInput?.click?.());
  dropZone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click?.();
    }
  });
  for (const eventName of ['dragenter', 'dragover']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add('is-dragover');
    });
  }
  for (const eventName of ['dragleave', 'dragend']) {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove('is-dragover');
      }
    });
  }
  dropZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('is-dragover');
    void selectRequestImportFile(event.dataTransfer?.files?.[0] || null);
  });
}

function bindRequestExportPickerModalUi() {
  $('cancelRequestExportPickerButton')?.addEventListener('click', () => resolveActiveModal(null));
  $('confirmRequestExportPickerButton')?.addEventListener('click', () => {
    if (selectedRequestExportTarget?.collectionId && selectedRequestExportTarget?.requestId) {
      resolveActiveModal(selectedRequestExportTarget);
    }
  });
}

function bindRequestExportModalUi() {
  const cancelButton = $('cancelRequestExportButton');
  const closeButton = $('requestExportCloseButton');
  const copyButton = $('copyRequestExportButton');
  const fileButton = $('fileRequestExportButton');
  cancelButton?.addEventListener('click', () => resolveActiveModal(null));
  closeButton?.addEventListener('click', () => resolveActiveModal(null));
  copyButton?.addEventListener('click', (event) => {
    event.preventDefault();
    void copyRequestExportText();
  });
  fileButton?.addEventListener('click', () => resolveActiveModal('file'));
}

function configureRequestExportModal(request = {}, format = 'postmeter', content = '') {
  activeRequestExportContent = String(content || '');
  const normalizedFormat = String(format || 'postmeter').toLowerCase();
  const formatLabel = normalizedFormat === 'curl' ? 'curl' : 'PostMeter';
  const requestName = requestDisplayName(request);
  $('requestExportTitle').textContent = `Export ${formatLabel} request`;
  $('requestExportMessage').textContent = `${formatLabel} export for "${requestName}". Copy it directly or export it to a file.`;
  $('requestExportTextLabel').textContent = `${formatLabel} request text`;
  const textOutput = $('requestExportTextOutput');
  if (textOutput) {
    textOutput.value = activeRequestExportContent;
    refreshCodeEditorIfTextarea(textOutput);
  }
  const copyStatus = $('requestExportCopyStatus');
  if (copyStatus) {
    copyStatus.hidden = true;
    copyStatus.textContent = '';
  }
}

function resetRequestExportModal() {
  activeRequestExportContent = '';
  const textOutput = $('requestExportTextOutput');
  if (textOutput) {
    textOutput.value = '';
    refreshCodeEditorIfTextarea(textOutput);
  }
  const copyStatus = $('requestExportCopyStatus');
  if (copyStatus) {
    copyStatus.hidden = true;
    copyStatus.textContent = '';
  }
}

async function copyRequestExportText() {
  const textOutput = $('requestExportTextOutput');
  const content = String(textOutput?.value || activeRequestExportContent || '');
  if (!content) {
    renderRequestExportStatus('Nothing to copy.');
    return;
  }
  try {
    const electronClipboard = window.__postmeterWriteClipboard || window.postmeter?.clipboard?.writeText;
    if (typeof electronClipboard === 'function') {
      await electronClipboard(content);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      textOutput?.focus?.();
      textOutput?.select?.();
      document.execCommand('copy');
    }
    renderRequestExportStatus('Copied request export to clipboard.');
    setStatus('Copied request export to clipboard.');
  } catch (error) {
    const message = error?.message || String(error);
    renderRequestExportStatus(`Copy failed: ${message}`);
  }
}

function renderRequestExportStatus(message) {
  const copyStatus = $('requestExportCopyStatus');
  if (!copyStatus) {
    return;
  }
  copyStatus.textContent = String(message || '');
  copyStatus.hidden = !copyStatus.textContent;
}

function resetRequestImportModal() {
  selectedRequestImportFilePath = '';
  selectedRequestImportFileName = '';
  const textInput = $('requestImportTextInput');
  if (textInput) {
    textInput.value = '';
    refreshCodeEditorIfTextarea(textInput);
  }
  const fileInput = $('requestImportFileInput');
  if (fileInput) {
    fileInput.value = '';
  }
  $('requestImportDropZone')?.classList.remove('is-dragover');
  const selection = $('requestImportFileSelection');
  if (selection) {
    selection.hidden = true;
    selection.textContent = '';
  }
  const error = $('requestImportError');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  updateRequestImportConfirmState();
}

async function selectRequestImportFile(file) {
  if (!file) {
    return;
  }
  const filePath = localPathForFile(file);
  if (!filePath) {
    renderRequestImportError('PostMeter could not read a local path for that file.');
    return;
  }
  selectedRequestImportFilePath = filePath;
  selectedRequestImportFileName = file.name || fileNameFromLocalPath(filePath);
  const selection = $('requestImportFileSelection');
  if (selection) {
    selection.textContent = `Selected file: ${selectedRequestImportFileName}`;
    selection.hidden = false;
  }
  const error = $('requestImportError');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  updateRequestImportConfirmState();
}

function renderRequestImportError(message) {
  const error = $('requestImportError');
  if (!error) {
    return;
  }
  error.textContent = String(message || 'Choose a request file or paste request text.');
  error.hidden = false;
}

function updateRequestImportConfirmState() {
  const text = String($('requestImportTextInput')?.value || '').trim();
  const hasSource = Boolean(text || selectedRequestImportFilePath);
  const confirm = $('confirmRequestImportButton');
  if (confirm) {
    confirm.disabled = !hasSource;
  }
}

function configureLocalFileSourceInput(input, prefix, mode) {
  if (!input) {
    return;
  }
  updateLocalFileSourceInputState(input, { enabled: true, prefix, mode });
  if (input.dataset.filePickerBound === 'true') {
    return;
  }
  input.dataset.filePickerBound = 'true';
  input.addEventListener('click', (event) => {
    if (input.dataset.fileSourceEnabled !== 'true') {
      return;
    }
    event.stopPropagation();
    showFileSourceMenu(input);
  });
  input.addEventListener('keydown', (event) => {
    if (input.dataset.fileSourceEnabled !== 'true') {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      showFileSourceMenu(input, { focus: true });
    }
  });
}

function updateLocalFileSourceInputState(input, options = {}) {
  if (!input) {
    return;
  }
  const enabled = options.enabled === true;
  input.dataset.fileSourceEnabled = enabled ? 'true' : 'false';
  input.dataset.fileSourcePrefix = options.prefix || '';
  input.dataset.fileSourceMode = options.mode || 'file';
  if (enabled) {
    input.setAttribute('aria-haspopup', 'menu');
    input.setAttribute('aria-controls', 'fileSourceMenu');
  } else {
    input.removeAttribute('aria-haspopup');
    input.removeAttribute('aria-controls');
  }
}

function showFileSourceMenu(input, options = {}) {
  const menu = $('fileSourceMenu');
  if (!menu || !input) {
    return;
  }
  closeContextMenu();
  closeToolbarMenus();
  activeFileSourceTarget = {
    input,
    mode: input.dataset.fileSourceMode || 'file',
    prefix: input.dataset.fileSourcePrefix || ''
  };
  menu.hidden = false;
  const rect = input.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8));
  const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  if (options.focus === true) {
    menu.querySelector('button')?.focus?.();
  }
}

function closeFileSourceMenu() {
  const menu = $('fileSourceMenu');
  if (!menu) {
    return;
  }
  menu.hidden = true;
  activeFileSourceTarget = null;
}

async function chooseFileForActiveSourceInput() {
  const target = activeFileSourceTarget;
  closeFileSourceMenu();
  if (!target?.input) {
    return null;
  }
  const selected = await showLocalFilePicker({
    kind: 'body-file-source',
    title: 'Choose request file',
    message: 'Drop a file here or choose one to use as the request body file source.',
    dropTitle: 'Drop request file here',
    dropDetail: 'The selected path will be bound to this request file source.'
  });
  if (!selected?.path) {
    return null;
  }
  await applySelectedFileSourceToInput(target.input, target.prefix, target.mode, selected);
  return selected;
}

async function applySelectedFileSourceToInput(input, prefix, mode, selected) {
  const localPath = String(selected?.path || '').trim();
  if (!input || !localPath) {
    return false;
  }
  const key = mode === 'formdata' ? fileSourceKeyForInput(input) : '';
  const bound = await upsertLocalFileAttachmentBinding(localPath, {
    fileName: selected.name || fileNameFromLocalPath(localPath),
    key,
    localPath,
    mode
  });
  if (!bound) {
    return false;
  }
  input.value = localPath;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  collectBodyEditorAndMarkDirty(prefix);
  setStatus(`File source selected: ${fileNameFromLocalPath(localPath)}.`);
  return true;
}

async function upsertLocalFileAttachmentBinding(source, options = {}) {
  const normalizedSource = String(source || '').trim();
  const localPath = String(options.localPath || source || '').trim();
  if (!normalizedSource || !localPath) {
    return false;
  }
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  workspace.settings.sandbox.fileBindings = normalizeSandboxFileBindings([
    ...workspace.settings.sandbox.fileBindings.filter((item) => item.source !== normalizedSource),
    {
      contentType: options.contentType || '',
      fileName: options.fileName || fileNameFromLocalPath(localPath),
      key: options.key || '',
      localPath,
      mode: options.mode || 'file',
      reviewedAt: new Date().toISOString(),
      source: normalizedSource
    }
  ]);
  return saveWorkspaceSettingsWithRollback(
    previousSettings,
    '',
    'File binding save failed',
    'File Binding Save Failed'
  );
}

function fileSourceKeyForInput(input) {
  return input?.closest?.('[data-body-form-data-row]')?.querySelector('[data-body-form-data-field="key"]')?.value || '';
}

function fileNameFromLocalPath(filePath) {
  if (typeof rendererEntityDisplay?.fileNameFromLocalPath === 'function') {
    return rendererEntityDisplay.fileNameFromLocalPath(filePath);
  }
  const text = String(filePath || '');
  return text.split(/[\\/]/).filter(Boolean).pop() || text || 'file';
}

async function chooseImportFilePath(kind) {
  if (!canResolveLocalFilePaths()) {
    return undefined;
  }
  const configs = {
    workspace: {
      accept: '.json,application/json',
      message: 'Drop a PostMeter workspace file here or choose one from this computer.',
      title: 'Import PostMeter Workspace'
    },
    collection: {
      accept: '.json,.yaml,.yml,.sh,application/json,application/yaml,text/yaml',
      message: 'Drop a collection file here or choose one from this computer.',
      title: 'Import Collection'
    },
    environment: {
      accept: '.json,application/json',
      message: 'Drop an environment file here or choose one from this computer.',
      title: 'Import Environment'
    },
    runner: {
      accept: '.json,application/json',
      message: 'Drop a runner file here or choose one from this computer.',
      title: 'Import Runner'
    },
    performance: {
      accept: '.json,application/json',
      message: 'Drop a performance test file here or choose one from this computer.',
      title: 'Import Performance Test'
    }
  };
  const config = configs[kind] || configs.workspace;
  const selected = await showLocalFilePicker({
    ...config,
    dropTitle: 'Drop file here',
    dropDetail: 'or choose a file from this computer.',
    kind
  });
  return selected?.path ? selected.path : null;
}

function focusInitialModalElement(modalId) {
  const preferredFocusIds = {
    unsavedRequestModal: 'cancelCloseRequestButton',
    saveDraftRequestModal: 'cancelSaveDraftButton',
    exportCollectionModal: 'cancelExportCollectionButton',
    exportItemModal: 'cancelExportItemButton',
    requestExportPickerModal: 'cancelRequestExportPickerButton',
    folderDestinationModal: 'cancelFolderDestinationButton',
    runnerImportModal: 'cancelRunnerImportButton',
    requestImportModal: 'requestImportTextInput',
    requestExportModal: 'copyRequestExportButton',
    clientCertificateModal: 'clientCertificateNameInput',
    textInputModal: $('textInputModal')?.dataset?.valueControl || 'textInputModalInput',
    csvVariablesModal: 'csvVariablesSchemaInput',
    htmlReportOptionsModal: 'htmlReportIncludeResultsInput',
    confirmActionModal: 'cancelConfirmActionButton',
    updateReminderModal: 'cancelUpdateReminderButton',
    authRefreshAutoDetectModal: 'cancelAuthRefreshAutoDetectButton',
    notificationModal: 'closeNotificationModalButton',
    cookiesModal: 'cookiesDomainInput',
    performanceCalibrationModal: 'closePerformanceCalibrationModalButton',
    filePickerModal: 'filePickerBrowseButton',
    vaultPromptModal: 'denyVaultPromptButton'
  };
  const preferred = preferredFocusIds[modalId] ? $(preferredFocusIds[modalId]) : null;
  const target = preferred || getModalFocusableElements($(modalId))[0];
  target?.focus?.();
}

function restoreModalFocus() {
  const target = lastModalFocusTarget;
  lastModalFocusTarget = null;
  if (!isRestorableFocusTarget(target)) {
    return;
  }
  target.focus?.();
}

function modalRestoreFocusTarget(target) {
  const menu = target?.closest?.('.toolbar-menu');
  if (menu) {
    const triggerId = menu.getAttribute?.('aria-labelledby');
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    if (trigger) {
      return trigger;
    }
  }
  return target || null;
}

function isRestorableFocusTarget(target) {
  if (!target || !target.isConnected || target.disabled) {
    return false;
  }
  for (let element = target; element; element = element.parentElement) {
    if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') {
      return false;
    }
  }
  return true;
}

function trapActiveModalFocus(event) {
  if (event?.key !== 'Tab' || !state.activeModalId || !state.activeModalResolver) {
    return false;
  }
  const modal = $(state.activeModalId);
  if (!modal || modal.hidden) {
    return false;
  }
  const focusable = getModalFocusableElements(modal);
  if (!focusable.length) {
    event.preventDefault();
    modal.focus?.();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!modal.contains(active)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function getModalFocusableElements(modal) {
  if (!modal) {
    return [];
  }
  return Array.from(modal.querySelectorAll([
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(','))).filter((element) => !element.hidden && element.offsetParent !== null);
}
