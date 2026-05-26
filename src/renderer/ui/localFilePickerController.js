const MAX_RENDERER_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

function bindLocalFilePickerUi() {
  const fileInput = $('filePickerInput');
  const browseButton = $('filePickerBrowseButton');
  const cancelButton = $('filePickerCancelButton');
  const closeButton = $('filePickerCloseButton');
  const dropZone = $('filePickerDropZone');
  const sourceChooseButton = $('fileSourceChooseButton');

  browseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    fileInput?.click?.();
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
  bindStaticFileSourceControl('binaryBodySourceInput', '', 'binary');
  bindStaticFileSourceControl('performanceBinaryBodySourceInput', 'performance', 'binary');
  bindAuthCertificateFileControls('');
  bindAuthCertificateFileControls('performance');
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
  $('filePickerDropZone')?.classList.remove('is-dragover');
  clearFilePickerError();
}

async function selectLocalFileFromPicker(file) {
  if (!file) {
    return;
  }
  if (activeFilePickerOptions?.readText === true) {
    const selection = await importSelectionFromFile(file);
    if (selection) {
      resolveActiveModal({
        ...selection,
        picker: activeFilePickerOptions?.kind || 'file'
      });
    }
    return;
  }
  if (activeFilePickerOptions?.fileBinding === true) {
    const contentBase64 = await fileToBase64(file);
    if (!contentBase64) {
      renderFilePickerFallbackError('PostMeter could not read that file for binding.');
      return;
    }
    resolveActiveModal({
      name: file.name || 'file',
      fileName: file.name || 'file',
      contentBase64,
      picker: activeFilePickerOptions?.kind || 'file'
    });
    return;
  }
  const contentBase64 = await fileToBase64(file);
  if (!contentBase64) {
    renderFilePickerFallbackError('PostMeter could not read that file.');
    return;
  }
  resolveActiveModal({
    name: file.name || 'file',
    fileName: file.name || 'file',
    contentBase64,
    picker: activeFilePickerOptions?.kind || 'file'
  });
}

async function fileToBase64(file) {
  const size = Number(file?.size || 0);
  if (size > MAX_RENDERER_IMPORT_FILE_BYTES) {
    renderFilePickerError('File attachments must be 10 MB or smaller.');
    return '';
  }
  const buffer = typeof file.arrayBuffer === 'function'
    ? await file.arrayBuffer()
    : stringToUtf8Buffer(typeof file.text === 'function' ? await file.text() : '');
  if (buffer.byteLength > MAX_RENDERER_IMPORT_FILE_BYTES) {
    renderFilePickerError('File attachments must be 10 MB or smaller.');
    return '';
  }
  const bytes = new Uint8Array(buffer);
  return bytesToBase64(bytes);
}

function stringToUtf8Buffer(value) {
  const text = String(value || '');
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(text).buffer;
  }
  const encoded = encodeURIComponent(text);
  const bytes = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%' && /^[0-9a-fA-F]{2}$/.test(encoded.slice(index + 1, index + 3))) {
      bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return new Uint8Array(bytes).buffer;
}

function renderFilePickerFallbackError(message) {
  const error = $('filePickerError');
  if (!error || error.hidden !== false || !error.textContent) {
    renderFilePickerError(message);
  }
}

function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triplet = (first << 16) | (second << 8) | third;
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[triplet & 63] : '=';
  }
  return output;
}

async function importSelectionFromFile(file) {
  const size = Number(file.size || 0);
  if (size > MAX_RENDERER_IMPORT_FILE_BYTES) {
    renderFilePickerError('Import files must be 10 MB or smaller.');
    return null;
  }
  const text = await file.text();
  if (text.length > MAX_RENDERER_IMPORT_FILE_BYTES) {
    renderFilePickerError('Import files must be 10 MB or smaller.');
    return null;
  }
  return {
    name: file.name || 'import.json',
    fileName: file.name || 'import.json',
    text
  };
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

function selectedFileLabelIdForInputId(inputId) {
  const id = String(inputId || '');
  return id.endsWith('Input') ? `${id.slice(0, -5)}Label` : `${id}Label`;
}

function selectedFileDisplayName(value) {
  const text = String(value || '').trim();
  return text ? fileNameFromLocalPath(text) : 'No file selected';
}

function findDescendantElementById(root, id) {
  if (!root || !id) {
    return null;
  }
  if (root.id === id) {
    return root;
  }
  const children = root.children || root.childNodes || [];
  for (const child of children) {
    const match = findDescendantElementById(child, id);
    if (match) {
      return match;
    }
  }
  return null;
}

function selectedFileLabelForInput(input) {
  if (!input?.id) {
    return null;
  }
  const labelId = selectedFileLabelIdForInputId(input.id);
  return $(labelId) || findDescendantElementById(input.parentElement, labelId);
}

function syncSelectedFileLabel(inputOrId) {
  const input = typeof inputOrId === 'string' ? $(inputOrId) : inputOrId;
  if (!input?.id) {
    return;
  }
  const label = selectedFileLabelForInput(input);
  if (!label) {
    return;
  }
  const value = String(input.value || '').trim();
  label.textContent = selectedFileDisplayName(value);
  label.title = value;
  label.classList?.toggle?.('is-empty', !value);
}

function setSelectedFileValue(inputOrId, value, options = {}) {
  const input = typeof inputOrId === 'string' ? $(inputOrId) : inputOrId;
  if (!input) {
    return;
  }
  input.value = String(value || '').trim();
  syncSelectedFileLabel(input);
  if (options.dispatch === true) {
    input.dispatchEvent?.(new Event('input', { bubbles: true }));
    input.dispatchEvent?.(new Event('change', { bubbles: true }));
  }
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
    const fileText = selectedRequestImportText;
    if (!text && !fileText && !filePath) {
      renderRequestImportError('Paste request text or choose a request file.');
      return;
    }
    resolveActiveModal({
      text: text || fileText,
      fileName: selectedRequestImportFileName,
      filePath: text || fileText ? '' : filePath
    });
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
  selectedRequestImportText = '';
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
  if (Number(file.size || 0) > MAX_RENDERER_IMPORT_FILE_BYTES) {
    renderRequestImportError('Import files must be 10 MB or smaller.');
    return;
  }
  const text = await file.text();
  if (text.length > MAX_RENDERER_IMPORT_FILE_BYTES) {
    renderRequestImportError('Import files must be 10 MB or smaller.');
    return;
  }
  selectedRequestImportText = text;
  selectedRequestImportFilePath = '';
  selectedRequestImportFileName = file.name || 'request import';
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
  const hasFileText = Boolean(selectedRequestImportText);
  const confirm = $('confirmRequestImportButton');
  if (confirm) {
    confirm.disabled = !hasSource && !hasFileText;
  }
}

function configureLocalFileSourceInput(input, prefix, mode) {
  if (!input) {
    return;
  }
  updateLocalFileSourceInputState(input, { enabled: true, prefix, mode });
  syncSelectedFileLabel(input);
  if (input.type === 'hidden') {
    return;
  }
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
  return chooseFileForSourceInput(target.input, target.prefix, target.mode);
}

async function chooseFileForSourceInput(input, prefix = '', mode = 'file') {
  if (!input) {
    return null;
  }
  const selected = await showLocalFilePicker({
    fileBinding: true,
    kind: 'body-file-source',
    title: 'Choose request file',
    message: 'Drop a file here or choose one to use as the request body file source.',
    dropTitle: 'Drop request file here',
    dropDetail: 'The selected file will be bound to this request file source.'
  });
  if (!selected?.path && !selected?.contentBase64 && !selected?.fileName && !selected?.name) {
    return null;
  }
  await applySelectedFileSourceToInput(input, prefix, mode, selected);
  return selected;
}

async function applySelectedFileSourceToInput(input, prefix, mode, selected) {
  const source = String(selected?.source || selected?.path || selected?.fileName || selected?.name || '').trim();
  if (!input || !source) {
    return false;
  }
  const key = mode === 'formdata' ? fileSourceKeyForInput(input) : '';
  const bound = await upsertLocalFileAttachmentBinding(source, {
    contentBase64: selected.contentBase64 || '',
    fileName: selected.fileName || selected.name || fileNameFromLocalPath(source),
    key,
    mode
  });
  if (!bound) {
    return false;
  }
  setSelectedFileValue(input, bound.source || source, { dispatch: true });
  collectBodyEditorAndMarkDirty(prefix);
  setStatus(`File source selected: ${bound.fileName || fileNameFromLocalPath(source)}.`);
  return true;
}

function bindStaticFileSourceControl(inputId, prefix, mode) {
  const input = $(inputId);
  if (!input || input.dataset.staticFileSourceBound === 'true') {
    syncSelectedFileLabel(input);
    return;
  }
  input.dataset.staticFileSourceBound = 'true';
  syncSelectedFileLabel(input);
  const importButton = $(`${inputId.slice(0, -5)}ImportButton`);
  const clearButton = $(`${inputId.slice(0, -5)}ClearButton`);
  importButton?.addEventListener('click', (event) => {
    event.preventDefault();
    void chooseFileForSourceInput(input, prefix, mode);
  });
  bindSelectedFileLabelTrigger(input, () => chooseFileForSourceInput(input, prefix, mode));
  clearButton?.addEventListener('click', (event) => {
    event.preventDefault();
    setSelectedFileValue(input, '', { dispatch: true });
    collectBodyEditorAndMarkDirty(prefix);
  });
}

function bindAuthCertificateFileControls(prefix = '') {
  const normalizedPrefix = prefix === 'performance' ? 'performance' : '';
  const bodyPrefix = normalizedPrefix === 'performance' ? 'performance' : '';
  const idPrefix = normalizedPrefix ? 'performanceAuthClient' : 'authClient';
  const controls = [
    { suffix: 'PfxPath', accept: '.pfx,.p12', title: 'Import PFX/P12 bundle' },
    { suffix: 'CertPath', accept: '.crt,.cer,.pem', title: 'Import PEM certificate' },
    { suffix: 'KeyPath', accept: '.key,.pem', title: 'Import PEM key' },
    { suffix: 'CaPath', accept: '.crt,.cer,.pem', title: 'Import CA certificate' }
  ];
  for (const control of controls) {
    const inputId = `${idPrefix}${control.suffix}Input`;
    const input = $(inputId);
    if (!input || input.dataset.authFileControlBound === 'true') {
      syncSelectedFileLabel(input);
      continue;
    }
    input.dataset.authFileControlBound = 'true';
    syncSelectedFileLabel(input);
    $(`${idPrefix}${control.suffix}ImportButton`)?.addEventListener('click', (event) => {
      event.preventDefault();
      void chooseAuthCertificateFile(input, control, bodyPrefix);
    });
    bindSelectedFileLabelTrigger(input, () => chooseAuthCertificateFile(input, control, bodyPrefix));
    $(`${idPrefix}${control.suffix}ClearButton`)?.addEventListener('click', (event) => {
      event.preventDefault();
      setSelectedFileValue(input, '', { dispatch: true });
      collectBodyEditorAndMarkDirty(bodyPrefix);
    });
  }
}

async function chooseAuthCertificateFile(input, config, prefix) {
  const selection = await showLocalFilePicker({
    accept: config.accept,
    fileBinding: true,
    dropDetail: 'or choose a certificate file from this computer.',
    dropTitle: 'Drop certificate file here',
    kind: 'certificate',
    message: 'Drop a certificate file here or choose one from this computer.',
    title: config.title
  });
  const binding = await storeMainOwnedLocalFile(selection, {
    contentKind: 'certificate',
    fileName: selection?.fileName || selection?.name || '',
    purpose: 'certificate'
  });
  if (!binding?.source) {
    return;
  }
  setSelectedFileValue(input, binding.source, { dispatch: true });
  collectBodyEditorAndMarkDirty(prefix);
}

function bindSelectedFileLabelTrigger(inputOrId, callback) {
  const input = typeof inputOrId === 'string' ? $(inputOrId) : inputOrId;
  if (!input?.id || typeof callback !== 'function') {
    return;
  }
  const label = selectedFileLabelForInput(input);
  if (!label || label.dataset.filePickerLabelBound === 'true') {
    return;
  }
  label.dataset.filePickerLabelBound = 'true';
  label.setAttribute('role', 'button');
  label.setAttribute('tabindex', '0');
  label.addEventListener('click', (event) => {
    event.preventDefault();
    void callback();
  });
  label.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    void callback();
  });
}

async function storeMainOwnedLocalFile(selection, options = {}) {
  if (!selection?.contentBase64) {
    return null;
  }
  const storeContent = window.__postmeterStoreLocalFile || window.postmeter?.localFiles?.storeContent;
  if (typeof storeContent !== 'function') {
    setStatus('Local file storage is unavailable in this runtime.');
    return null;
  }
  try {
    const result = await storeContent({
      contentBase64: selection.contentBase64,
      contentKind: options.contentKind || '',
      contentType: options.contentType || '',
      fileName: options.fileName || selection.fileName || selection.name || 'file',
      purpose: options.purpose || 'file'
    });
    if (result?.cancelled) {
      return null;
    }
    return result?.binding || null;
  } catch (error) {
    setStatus(`Local file save failed: ${error.message || String(error)}`);
    return null;
  }
}

async function upsertLocalFileAttachmentBinding(source, options = {}) {
  const normalizedSource = String(source || '').trim();
  if (!normalizedSource) {
    return false;
  }
  ensureSettings();
  const previousSettings = cloneWorkspaceSettings();
  let binding = null;
  try {
    if (options.contentBase64 && window.postmeter?.fileBindings?.storeContent) {
      const result = await window.postmeter.fileBindings.storeContent({
        contentBase64: options.contentBase64,
        contentType: options.contentType || '',
        fileName: options.fileName || fileNameFromLocalPath(normalizedSource),
        key: options.key || '',
        mode: options.mode || 'file',
        source: normalizedSource
      });
      if (result?.cancelled) {
        return false;
      }
      binding = result?.binding || null;
    } else if (window.postmeter?.fileBindings?.choose) {
      const result = await window.postmeter.fileBindings.choose({
        contentType: options.contentType || '',
        fileName: options.fileName || fileNameFromLocalPath(normalizedSource),
        key: options.key || '',
        mode: options.mode || 'file',
        source: normalizedSource
      });
      if (result?.cancelled) {
        return false;
      }
      binding = result?.binding || null;
    }
  } catch (error) {
    setStatus(`File binding save failed: ${error.message || String(error)}`);
    return false;
  }
  const metadata = binding || {
    bound: false,
    contentType: options.contentType || '',
    fileName: options.fileName || fileNameFromLocalPath(normalizedSource),
    key: options.key || '',
    mode: options.mode || 'file',
    reviewedAt: new Date().toISOString(),
    source: normalizedSource
  };
  workspace.settings.sandbox.fileBindings = normalizeSandboxFileBindings([
    ...workspace.settings.sandbox.fileBindings.filter((item) => item.source !== normalizedSource),
    metadata
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
    kind,
    readText: true
  });
  if (selected?.text != null) {
    return {
      fileName: selected.fileName || selected.name || 'import.json',
      text: selected.text
    };
  }
  return null;
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
    workspaceEncryptionModal: 'workspaceEncryptionKeyInput',
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
