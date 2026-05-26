function bodyControlId(prefix, id) {
  return prefix ? `${prefix}${id.charAt(0).toUpperCase()}${id.slice(1)}` : id;
}

function bodyElement(prefix, id) {
  return $(bodyControlId(prefix, id));
}

function requestEditorContext(scope = 'request') {
  const isPerformance = scope === 'performance';
  return {
    scope: isPerformance ? 'performance' : 'request',
    bodyPrefix: isPerformance ? 'performance' : '',
    rootId: isPerformance ? 'performanceRequestSection' : 'requestEditorPanel',
    methodSelectId: isPerformance ? 'performanceMethodSelect' : 'methodSelect',
    urlInputId: isPerformance ? 'performanceUrlInput' : 'urlInput',
    paramsTableId: isPerformance ? 'performanceParamsTable' : 'paramsTable',
    headersTableId: isPerformance ? 'performanceHeadersTable' : 'headersTable',
    variablesTableId: isPerformance ? 'performanceRequestVariablesTable' : 'requestVariablesTable',
    preRequestScriptInputId: isPerformance ? 'performancePreRequestScriptInput' : 'preRequestScriptInput',
    testScriptInputId: isPerformance ? 'performanceTestScriptInput' : 'testScriptInput',
    docsInputId: isPerformance ? 'performanceDocsInput' : 'docsInput',
    docsPane: isPerformance ? '' : 'requestDocs',
    cookieJarEnabledInputId: isPerformance ? 'performanceRequestCookieJarEnabledInput' : 'requestCookieJarEnabledInput',
    cookieJarStoreInputId: isPerformance ? 'performanceRequestCookieJarStoreInput' : 'requestCookieJarStoreInput',
    addVariableButtonId: isPerformance ? 'addPerformanceRequestVariableButton' : 'addRequestVariableButton',
    autoHeaderTokenInputId: isPerformance ? 'performanceSendPostMeterTokenInput' : 'sendPostMeterTokenInput',
    autoHeaderShowInputId: isPerformance ? 'performanceShowGeneratedHeadersInput' : 'showGeneratedHeadersInput',
    autoHeaderLabelId: isPerformance ? 'performanceShowGeneratedHeadersLabel' : 'showGeneratedHeadersLabel'
  };
}

function activeRequestForEditorContext(contextOrScope = 'request') {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  return context.scope === 'performance' ? activePerformanceTest()?.request || null : activeRequest();
}

function bodyModeForRequest(request) {
  const mode = String(request?.postmanBody?.mode || '').toLowerCase();
  if (mode === 'graphql' || request?.protocol === 'graphql' || hasGraphqlBody(request)) {
    return 'GRAPHQL';
  }
  if (mode === 'formdata' || mode === 'form-data') {
    return 'FORM_DATA';
  }
  if (mode === 'urlencoded') {
    return 'URLENCODED';
  }
  if (mode === 'binary' || mode === 'file') {
    return 'BINARY';
  }
  if (mode === 'raw') {
    return 'RAW';
  }
  if (request?.bodyType === 'FORM_DATA') {
    return 'FORM_DATA';
  }
  if (request?.bodyType === 'URLENCODED') {
    return 'URLENCODED';
  }
  if (request?.bodyType === 'BINARY') {
    return 'BINARY';
  }
  if (BODY_TYPE_RAW_FORMATS[request?.bodyType] || request?.body) {
    return 'RAW';
  }
  return 'NONE';
}

function rawFormatForRequest(request) {
  const language = request?.postmanBody?.mode === 'raw'
    ? request.postmanBody?.options?.raw?.language
    : '';
  return normalizeRawBodyFormat(language || BODY_TYPE_RAW_FORMATS[request?.bodyType] || 'text');
}

function normalizeRawBodyFormat(value) {
  const format = String(value || 'text').toLowerCase();
  if (format === 'js') {
    return 'javascript';
  }
  return RAW_BODY_FORMATS.includes(format) ? format : 'text';
}

function rawBodyEditorLanguage(format) {
  const normalized = normalizeRawBodyFormat(format);
  if (normalized === 'json' || normalized === 'javascript') {
    return normalized;
  }
  if (normalized === 'html' || normalized === 'xml') {
    return normalized;
  }
  return 'text';
}

function rawBodyTextForRequest(request) {
  if (String(request?.postmanBody?.mode || '').toLowerCase() === 'raw') {
    return String(request.postmanBody.raw ?? '');
  }
  return String(request?.body || '');
}

function hasGraphqlBody(request) {
  if (!request) {
    return false;
  }
  const graphql = request.postmanBody?.graphql || request.graphql;
  return graphql && typeof graphql === 'object' && Object.keys(graphql).length > 0;
}

function graphqlBodyForRequestEditor(request) {
  const source = request?.postmanBody?.graphql && typeof request.postmanBody.graphql === 'object' && Object.keys(request.postmanBody.graphql).length
    ? request.postmanBody.graphql
    : request?.graphql && typeof request.graphql === 'object' && Object.keys(request.graphql).length
      ? request.graphql
      : parseJsonObjectForBodyEditor(request?.body);
  return {
    operationName: source?.operationName == null ? '' : String(source.operationName),
    query: source?.query == null ? '' : String(source.query),
    variables: graphqlVariablesTextForBodyEditor(source?.variables)
  };
}

function graphqlVariablesTextForBodyEditor(value) {
  if (value == null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonObjectForBodyEditor(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || !/^[{[]/.test(text)) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function renderRequestBodyEditor(prefix, request) {
  const mode = request ? bodyModeForRequest(request) : 'NONE';
  const modeSelect = bodyElement(prefix, 'bodyTypeSelect');
  const rawSelect = bodyElement(prefix, 'bodyRawFormatSelect');
  if (modeSelect) {
    modeSelect.value = BODY_MODES.includes(mode) ? mode : 'NONE';
  }
  if (rawSelect) {
    rawSelect.value = rawFormatForRequest(request);
  }
  const rawInput = bodyElement(prefix, 'bodyInput');
  if (rawInput) {
    rawInput.value = request ? rawBodyTextForRequest(request) : '';
  }
  renderBodyFormDataRows(prefix, request ? formDataRowsForRequest(request) : []);
  renderBodyUrlencodedRows(prefix, request ? urlencodedRowsForRequest(request) : []);
  const binary = binaryBodyForRequest(request);
  setValue(bodyControlId(prefix, 'binaryBodySourceInput'), binary.source);
  if (typeof syncSelectedFileLabel === 'function') {
    syncSelectedFileLabel(bodyControlId(prefix, 'binaryBodySourceInput'));
  }
  const graphql = graphqlBodyForRequestEditor(request);
  setValue(bodyControlId(prefix, 'graphqlQueryInput'), graphql.query);
  setValue(bodyControlId(prefix, 'graphqlVariablesInput'), graphql.variables);
  setValue(bodyControlId(prefix, 'graphqlOperationNameInput'), graphql.operationName);
  updateBodyModePanels(prefix);
  updateBodyEditorLanguage(prefix);
}

function updateBodyModePanels(prefix) {
  const mode = bodyElement(prefix, 'bodyTypeSelect')?.value || 'NONE';
  const panels = {
    NONE: 'bodyNonePanel',
    RAW: 'bodyRawPanel',
    FORM_DATA: 'bodyFormDataPanel',
    URLENCODED: 'bodyUrlencodedPanel',
    BINARY: 'bodyBinaryPanel',
    GRAPHQL: 'bodyGraphqlPanel'
  };
  for (const [candidate, panelId] of Object.entries(panels)) {
    bodyElement(prefix, panelId)?.classList.toggle('active', mode === candidate);
  }
  const rawField = bodyElement(prefix, 'bodyRawFormatField');
  if (rawField) {
    rawField.hidden = mode !== 'RAW';
  }
  const graphqlOperationField = bodyElement(prefix, 'graphqlOperationNameField');
  if (graphqlOperationField) {
    graphqlOperationField.hidden = mode !== 'GRAPHQL';
  }
  const beautifyButton = bodyElement(prefix, 'beautifyBodyButton');
  if (beautifyButton) {
    beautifyButton.hidden = mode !== 'RAW' && mode !== 'GRAPHQL';
  }
}

function updateBodyEditorLanguage(prefix) {
  updateBodyModePanels(prefix);
  const format = bodyElement(prefix, 'bodyRawFormatSelect')?.value || 'text';
  CodeEditor.setLanguage?.(bodyElement(prefix, 'bodyInput'), rawBodyEditorLanguage(format));
  CodeEditor.setLanguage?.(bodyElement(prefix, 'graphqlQueryInput'), 'graphql');
  CodeEditor.setLanguage?.(bodyElement(prefix, 'graphqlVariablesInput'), 'json');
}

function beautifyBodyEditor(prefix) {
  const mode = bodyElement(prefix, 'bodyTypeSelect')?.value || 'NONE';
  let changed = false;
  if (mode === 'RAW') {
    const format = bodyElement(prefix, 'bodyRawFormatSelect')?.value || 'text';
    changed = setBeautifiedTextareaValue(
      bodyElement(prefix, 'bodyInput'),
      (value) => beautifyBodyText(value, format)
    ) || changed;
  } else if (mode === 'GRAPHQL') {
    changed = setBeautifiedTextareaValue(
      bodyElement(prefix, 'graphqlQueryInput'),
      (value) => beautifyBodyText(value, 'graphql')
    ) || changed;
    changed = setBeautifiedTextareaValue(
      bodyElement(prefix, 'graphqlVariablesInput'),
      (value) => beautifyBodyText(value, 'json')
    ) || changed;
  }
  if (changed) {
    collectBodyEditorAndMarkDirty(prefix);
  }
}

function setBeautifiedTextareaValue(textarea, formatter) {
  if (!textarea || typeof formatter !== 'function') {
    return false;
  }
  const nextValue = formatter(textarea.value || '');
  if (nextValue === textarea.value) {
    return false;
  }
  textarea.value = nextValue;
  refreshVariableHighlights(textarea.parentElement || textarea);
  return true;
}

function formDataRowsForRequest(request) {
  const body = request?.postmanBody || {};
  if (!['formdata', 'form-data'].includes(String(body.mode || '').toLowerCase())) {
    return [];
  }
  const rows = [];
  for (const part of Array.isArray(body.formdata) ? body.formdata : []) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const type = part.src != null || String(part.type || '').toLowerCase() === 'file' ? 'file' : 'text';
    const sources = type === 'file' && Array.isArray(part.src) ? part.src : [part.src];
    if (type === 'file') {
      for (const source of sources) {
        rows.push({
          enabled: part.disabled !== true && part.enabled !== false,
          key: part.key == null ? '' : String(part.key),
          type,
          value: source == null ? '' : String(source)
        });
      }
      continue;
    }
    rows.push({
      enabled: part.disabled !== true && part.enabled !== false,
      key: part.key == null ? '' : String(part.key),
      type,
      value: part.value == null ? '' : String(part.value)
    });
  }
  return rows;
}

function urlencodedRowsForRequest(request) {
  const body = request?.postmanBody || {};
  if (String(body.mode || '').toLowerCase() !== 'urlencoded') {
    return [];
  }
  return (Array.isArray(body.urlencoded) ? body.urlencoded : [])
    .filter((part) => part && typeof part === 'object')
    .map((part) => ({
      enabled: part.disabled !== true && part.enabled !== false,
      key: part.key == null ? '' : String(part.key),
      value: part.value == null ? '' : String(part.value)
    }));
}

function binaryBodyForRequest(request) {
  const body = request?.postmanBody || {};
  const mode = String(body.mode || '').toLowerCase();
  const binary = mode === 'file' ? body.file : body.binary;
  return {
    source: binary?.src == null ? '' : String(binary.src),
    contentType: binary?.contentType == null ? '' : String(binary.contentType)
  };
}

function renderBodyFormDataRows(prefix, rows) {
  const container = bodyElement(prefix, 'formDataBodyTable');
  if (!container) {
    return;
  }
  container.textContent = '';
  for (const row of rows) {
    container.append(createBodyFormDataRow(prefix, row));
  }
  refreshVariableHighlights(container);
}

function createBodyFormDataRow(prefix, row = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'body-form-data-row';
  wrapper.dataset.bodyFormDataRow = 'true';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = row.enabled !== false;
  enabled.setAttribute('aria-label', 'Form-data field enabled');
  const type = document.createElement('select');
  type.dataset.bodyFormDataField = 'type';
  type.append(new Option('Text', 'text'), new Option('File', 'file'));
  type.value = row.type === 'file' ? 'file' : 'text';
  const key = document.createElement('input');
  key.dataset.bodyFormDataField = 'key';
  key.placeholder = 'Key';
  key.value = row.key || '';
  const value = document.createElement('input');
  value.dataset.bodyFormDataField = 'value';
  value.value = row.value || '';
  const valueCell = document.createElement('div');
  valueCell.className = 'body-form-data-value-cell';
  const fileControl = document.createElement('div');
  fileControl.className = 'file-import-row';
  const fileControlId = Math.random().toString(36).slice(2);
  const valueLabel = document.createElement('span');
  valueLabel.className = 'selected-file-label is-empty';
  valueLabel.id = `bodyFormDataFileSource-${fileControlId}Label`;
  value.id = `bodyFormDataFileSource-${fileControlId}Input`;
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.textContent = 'Import';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear';
  fileControl.append(valueLabel, importButton, clearButton);
  valueCell.append(value, fileControl);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger-button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    wrapper.remove();
    collectBodyEditorAndMarkDirty(prefix);
  });
  const syncType = () => {
    const isFile = type.value === 'file';
    value.type = isFile ? 'hidden' : 'text';
    value.placeholder = isFile ? '' : 'Value';
    fileControl.hidden = !isFile;
    updateLocalFileSourceInputState(value, { enabled: isFile, prefix, mode: 'formdata' });
    if (typeof syncSelectedFileLabel === 'function') {
      syncSelectedFileLabel(value);
    }
    if (!isFile) {
      closeFileSourceMenu();
    }
  };
  configureLocalFileSourceInput(value, prefix, 'formdata');
  importButton.addEventListener('click', (event) => {
    event.preventDefault();
    void chooseFileForSourceInput(value, prefix, 'formdata');
  });
  if (typeof bindSelectedFileLabelTrigger === 'function') {
    bindSelectedFileLabelTrigger(value, () => chooseFileForSourceInput(value, prefix, 'formdata'));
  }
  clearButton.addEventListener('click', (event) => {
    event.preventDefault();
    setSelectedFileValue(value, '', { dispatch: true });
    collectBodyEditorAndMarkDirty(prefix);
  });
  for (const control of [enabled, type, key, value]) {
    const eventType = control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input';
    control.addEventListener(eventType, () => {
      syncType();
      collectBodyEditorAndMarkDirty(prefix);
    });
  }
  syncType();
  wrapper.append(enabled, type, key, valueCell, remove);
  return wrapper;
}

function renderBodyUrlencodedRows(prefix, rows) {
  const container = bodyElement(prefix, 'urlencodedBodyTable');
  if (!container) {
    return;
  }
  container.textContent = '';
  for (const row of rows) {
    container.append(createBodyUrlencodedRow(prefix, row));
  }
  refreshVariableHighlights(container);
}

function createBodyUrlencodedRow(prefix, row = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'body-urlencoded-row';
  wrapper.dataset.bodyUrlencodedRow = 'true';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = row.enabled !== false;
  enabled.setAttribute('aria-label', 'URL-encoded field enabled');
  const key = document.createElement('input');
  key.dataset.bodyUrlencodedField = 'key';
  key.placeholder = 'Key';
  key.value = row.key || '';
  const value = document.createElement('input');
  value.dataset.bodyUrlencodedField = 'value';
  value.placeholder = 'Value';
  value.value = row.value || '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger-button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    wrapper.remove();
    collectBodyEditorAndMarkDirty(prefix);
  });
  for (const control of [enabled, key, value]) {
    const eventType = control.type === 'checkbox' ? 'change' : 'input';
    control.addEventListener(eventType, () => collectBodyEditorAndMarkDirty(prefix));
  }
  wrapper.append(enabled, key, value, remove);
  return wrapper;
}

function addBodyFormDataRow(prefix) {
  const container = bodyElement(prefix, 'formDataBodyTable');
  container?.append(createBodyFormDataRow(prefix, { enabled: true, key: '', type: 'text', value: '' }));
  refreshVariableHighlights(container);
  collectBodyEditorAndMarkDirty(prefix);
}

function addBodyUrlencodedRow(prefix) {
  const container = bodyElement(prefix, 'urlencodedBodyTable');
  container?.append(createBodyUrlencodedRow(prefix, { enabled: true, key: '', value: '' }));
  refreshVariableHighlights(container);
  collectBodyEditorAndMarkDirty(prefix);
}

function collectBodyEditorAndMarkDirty(prefix) {
  if (prefix === 'performance') {
    collectPerformanceTestAndMarkDirty();
  } else {
    collectRequestAndMarkDirty();
  }
}

function collectBodyFromEditor(prefix, request = {}) {
  const mode = bodyElement(prefix, 'bodyTypeSelect')?.value || 'NONE';
  if (mode === 'RAW') {
    const format = normalizeRawBodyFormat(bodyElement(prefix, 'bodyRawFormatSelect')?.value || 'text');
    const body = bodyElement(prefix, 'bodyInput')?.value || '';
    return {
      body,
      bodyType: RAW_FORMAT_BODY_TYPES[format] || 'RAW_TEXT',
      postmanBody: {
        mode: 'raw',
        raw: body,
        options: {
          raw: {
            language: format
          }
        }
      }
    };
  }
  if (mode === 'FORM_DATA') {
    const formdata = collectBodyFormDataRows(prefix);
    return {
      body: '',
      bodyType: 'FORM_DATA',
      postmanBody: {
        mode: 'formdata',
        formdata
      }
    };
  }
  if (mode === 'URLENCODED') {
    const urlencoded = collectBodyUrlencodedRows(prefix);
    return {
      body: '',
      bodyType: 'URLENCODED',
      postmanBody: {
        mode: 'urlencoded',
        urlencoded
      }
    };
  }
  if (mode === 'BINARY') {
    const source = bodyElement(prefix, 'binaryBodySourceInput')?.value.trim() || '';
    const contentType = source ? detectFileContentType(source) : '';
    return {
      body: '',
      bodyType: source ? 'BINARY' : 'NONE',
      postmanBody: {
        mode: 'binary',
        binary: {
          src: source,
          contentType
        }
      }
    };
  }
  if (mode === 'GRAPHQL') {
    const graphql = {
      query: bodyElement(prefix, 'graphqlQueryInput')?.value || '',
      variables: bodyElement(prefix, 'graphqlVariablesInput')?.value || '',
      operationName: bodyElement(prefix, 'graphqlOperationNameInput')?.value.trim() || ''
    };
    return {
      body: JSON.stringify(graphql),
      bodyType: 'RAW_JSON',
      graphql,
      postmanBody: {
        mode: 'graphql',
        graphql
      },
      protocol: 'graphql'
    };
  }
  return {
    body: '',
    bodyType: 'NONE',
    postmanBody: {}
  };
}

function collectBodyFormDataRows(prefix) {
  return Array.from(bodyElement(prefix, 'formDataBodyTable')?.querySelectorAll('[data-body-form-data-row]') || [])
    .map((row) => {
      const type = row.querySelector('[data-body-form-data-field="type"]')?.value === 'file' ? 'file' : 'text';
      const key = row.querySelector('[data-body-form-data-field="key"]')?.value || '';
      const value = row.querySelector('[data-body-form-data-field="value"]')?.value || '';
      const base = {
        disabled: row.querySelector('input[type="checkbox"]')?.checked === false,
        key,
        type
      };
      return type === 'file'
        ? { ...base, src: value }
        : { ...base, value };
    })
    .filter((row) => row.key || row.value || row.src);
}

function collectBodyUrlencodedRows(prefix) {
  return Array.from(bodyElement(prefix, 'urlencodedBodyTable')?.querySelectorAll('[data-body-urlencoded-row]') || [])
    .map((row) => ({
      disabled: row.querySelector('input[type="checkbox"]')?.checked === false,
      key: row.querySelector('[data-body-urlencoded-field="key"]')?.value || '',
      value: row.querySelector('[data-body-urlencoded-field="value"]')?.value || ''
    }))
    .filter((row) => row.key || row.value);
}

function syncRequestBodyFieldsFromEditor(prefix, request) {
  if (!request) {
    return;
  }
  const body = collectBodyFromEditor(prefix, request);
  request.bodyType = BODY_TYPES.includes(body.bodyType) ? body.bodyType : 'NONE';
  request.body = body.body;
  request.postmanBody = body.postmanBody;
  if (body.protocol === 'graphql') {
    request.protocol = 'graphql';
    request.graphql = cloneJson(body.graphql) || {
      query: '',
      variables: '',
      operationName: ''
    };
  } else if (request.protocol === 'graphql') {
    request.protocol = 'http';
    delete request.graphql;
  }
  syncPostmanFileReferences(request);
}

function syncPostmanFileReferences(request) {
  if (!request) {
    return;
  }
  const references = fileReferencesFromPostmanBody(request.postmanBody);
  if (references.length) {
    request.postman = {
      ...(request.postman || {}),
      fileReferences: references
    };
    return;
  }
  if (request.postman?.fileReferences) {
    request.postman = { ...(request.postman || {}) };
    delete request.postman.fileReferences;
    if (!Object.keys(request.postman).length) {
      delete request.postman;
    }
  }
}

function fileReferencesFromPostmanBody(postmanBody) {
  const mode = String(postmanBody?.mode || '').toLowerCase();
  if (mode === 'binary' || mode === 'file') {
    const body = mode === 'file' ? postmanBody.file : postmanBody.binary;
    const source = String(body?.src || '').trim();
    return source ? [{
      contentType: body?.contentType == null ? '' : String(body.contentType),
      key: '',
      mode: 'binary',
      source
    }] : [];
  }
  if (mode !== 'formdata' && mode !== 'form-data') {
    return [];
  }
  const references = [];
  for (const part of Array.isArray(postmanBody.formdata) ? postmanBody.formdata : []) {
    if (!part || typeof part !== 'object' || part.disabled === true || part.enabled === false) {
      continue;
    }
    const isFile = part.src != null || String(part.type || '').toLowerCase() === 'file';
    if (!isFile) {
      continue;
    }
    const sources = Array.isArray(part.src) ? part.src : [part.src];
    for (const source of sources) {
      const normalized = String(source || '').trim();
      if (!normalized) {
        continue;
      }
      references.push({
        contentType: '',
        key: part.key == null ? '' : String(part.key),
        mode: 'formdata',
        source: normalized
      });
    }
  }
  return references;
}

function updateRequestEditorLanguages() {
  updateRequestBodyEditorLanguage();
  CodeEditor.setLanguage?.($('preRequestScriptInput'), 'javascript');
  CodeEditor.setLanguage?.($('testScriptInput'), 'javascript');
}

function updateCollectionEditorLanguages() {
  CodeEditor.setLanguage?.($('collectionPreRequestScriptInput'), 'javascript');
  CodeEditor.setLanguage?.($('collectionTestScriptInput'), 'javascript');
}

function updateFolderEditorLanguages() {
  CodeEditor.setLanguage?.($('folderPreRequestScriptInput'), 'javascript');
  CodeEditor.setLanguage?.($('folderTestScriptInput'), 'javascript');
}

function updatePerformanceRequestEditorLanguages() {
  updatePerformanceRequestBodyEditorLanguage();
  CodeEditor.setLanguage?.($('performancePreRequestScriptInput'), 'javascript');
  CodeEditor.setLanguage?.($('performanceTestScriptInput'), 'javascript');
}

function updateRequestBodyEditorLanguage() {
  updateBodyEditorLanguage('');
}

function updatePerformanceRequestBodyEditorLanguage() {
  updateBodyEditorLanguage('performance');
}

function ensureRequestQueryEditorMirror(request) {
  if (!request) {
    return;
  }
  request.queryParams = Array.isArray(request.queryParams) ? request.queryParams : [];
  const urlQuery = splitEditorUrlQuery(request.url || '').query;
  if (enabledEditorQueryParams(request.queryParams).length > 0 && !urlQuery) {
    request.url = editorUrlWithQueryParams(request.url || '', request.queryParams);
    return;
  }
  if (!request.queryParams.length && urlQuery) {
    request.queryParams = queryParamsFromEditorUrl(request.url || '');
  }
}

function syncRequestParamsFromUrlInput() {
  syncRequestParamsFromUrlInputForContext('request');
}

function syncRequestUrlInputFromParams() {
  syncRequestUrlInputFromParamsForContext('request');
}

function syncPerformanceParamsFromUrlInput() {
  syncRequestParamsFromUrlInputForContext('performance');
}

function syncPerformanceUrlInputFromParams() {
  syncRequestUrlInputFromParamsForContext('performance');
}

function syncRequestParamsFromUrlInputForContext(contextOrScope) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  const request = activeRequestForEditorContext(context);
  const input = $(context.urlInputId);
  if (!request || !input) {
    return;
  }
  request.queryParams = queryParamsFromEditorUrl(input.value);
  renderRequestPairsForContext(context, context.paramsTableId, request.queryParams, 'queryParams');
}

function syncRequestUrlInputFromParamsForContext(contextOrScope) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  const request = activeRequestForEditorContext(context);
  const input = $(context.urlInputId);
  if (!request || !input) {
    return;
  }
  request.queryParams = collectKeyValueRowsFromTable(context.paramsTableId, request.queryParams || []);
  const nextUrl = editorUrlWithQueryParams(input.value, request.queryParams);
  if (input.value !== nextUrl) {
    input.value = nextUrl;
  }
  request.url = nextUrl.trim();
  refreshVariableHighlights(input);
}

function renderRequestEditorForContext(contextOrScope, request, options = {}) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  if (!request) {
    setValue(context.methodSelectId, 'GET');
    updateMethodSelectClassFor(context.methodSelectId);
    setValue(context.urlInputId, '');
    renderRequestBodyEditor(context.bodyPrefix, null);
    setValue(context.preRequestScriptInputId, '');
    setValue(context.testScriptInputId, '');
    setValue(context.docsInputId, '');
    if (context.docsPane) {
      renderMarkdownPane(context.docsPane);
    }
    for (const id of [context.paramsTableId, context.headersTableId, context.variablesTableId]) {
      const container = $(id);
      if (container) {
        container.textContent = '';
      }
    }
    renderRequestHeaderControlsForContext(context, null);
    setChecked(context.cookieJarEnabledInputId, false);
    setChecked(context.cookieJarStoreInputId, true);
    setManagedCookieJarToggleState(context.bodyPrefix, false);
    renderRequestSettingsControls(null, context.scope);
    const addVariableButton = $(context.addVariableButtonId);
    if (addVariableButton) {
      addVariableButton.disabled = true;
    }
    renderRequestAuthEditorForContext(context, { type: 'none' });
    renderRequestVariablePreviewForContext(context);
    updateRequestEditorLanguagesForContext(context);
    refreshVariableHighlights($(context.rootId));
    return;
  }

  ensureRequestQueryEditorMirror(request);
  request.queryParams ||= [];
  request.headers ||= [];
  request.variables ||= [];
  request.scripts ||= { preRequest: '', tests: '' };
  request.docs = request.docs == null ? '' : String(request.docs);
  request.cookieJar ||= { enabled: false, storeResponses: true };
  request.auth ||= { type: 'none' };
  ensureRequestAutoHeaders(request);
  const managedCookieRequest = typeof options.applyRefreshingCookieState === 'function'
    ? options.applyRefreshingCookieState(request) === true
    : false;

  const addVariableButton = $(context.addVariableButtonId);
  if (addVariableButton) {
    addVariableButton.disabled = false;
  }
  const method = METHODS.includes(String(request.method || '').toUpperCase())
    ? String(request.method || '').toUpperCase()
    : 'GET';
  request.method = method;
  setValue(context.methodSelectId, method);
  updateMethodSelectClassFor(context.methodSelectId);
  setValue(context.urlInputId, request.url || '');
  renderRequestBodyEditor(context.bodyPrefix, request);
  setValue(context.preRequestScriptInputId, request.scripts.preRequest || '');
  setValue(context.testScriptInputId, request.scripts.tests || '');
  setValue(context.docsInputId, request.docs || '');
  if (context.docsPane) {
    renderMarkdownPane(context.docsPane);
  }
  setChecked(context.cookieJarEnabledInputId, request.cookieJar.enabled === true);
  setChecked(context.cookieJarStoreInputId, request.cookieJar.storeResponses !== false);
  setManagedCookieJarToggleState(context.bodyPrefix, managedCookieRequest);
  renderRequestSettingsControls(request, context.scope);
  renderRequestPairsForContext(context, context.paramsTableId, request.queryParams, 'queryParams');
  renderRequestHeaderPairsForContext(context, context.headersTableId, request);
  renderRequestVariablePairsForContext(context, request.variables);
  renderRequestCookieJarEditorForContext(context);
  renderRequestAuthEditorForContext(context, request.auth || { type: 'none' });
  renderRequestVariablePreviewForContext(context);
  updateRequestEditorLanguagesForContext(context);
  refreshVariableHighlights($(context.rootId));
}

function renderRequestAuthEditorForContext(context, auth) {
  if (context.scope === 'performance') {
    renderPerformanceAuthEditor(auth);
    return;
  }
  renderAuthEditor(auth);
}

function renderRequestCookieJarEditorForContext(context) {
  if (context.scope === 'performance') {
    renderPerformanceCookieJarEditor();
    return;
  }
  renderCookieJarEditor();
}

function renderRequestVariablePreviewForContext(context) {
  if (context.scope === 'performance') {
    renderPerformanceVariablePreview();
    return;
  }
  renderVariablePreview();
}

function updateRequestEditorLanguagesForContext(context) {
  if (context.scope === 'performance') {
    updatePerformanceRequestEditorLanguages();
    return;
  }
  updateRequestEditorLanguages();
}

function renderRequestEditor() {
  resetRequestEditorTransientStateOnContextChange();
  const request = activeRequest();
  renderRequestTitle(request);
  $('saveRequestButton').disabled = !request;
  $('exportRequestPanelButton').disabled = !request;
  $('exportRequestPanelPostmeterButton').disabled = !request;
  $('exportRequestPanelCurlButton').disabled = !request;
  renderRequestEditorForContext('request', request, {
    applyRefreshingCookieState: () => applyActiveRequestRefreshingCookieState(request)
  });
}

function renderCollectionEditor() {
  const collection = activeCollection();
  renderCollectionTitle(collection);
  const saveButton = $('saveCollectionButton');
  if (saveButton) {
    saveButton.disabled = !collection;
  }
  const addVariableButton = $('addCollectionVariableButton');
  if (addVariableButton) {
    addVariableButton.disabled = !collection;
  }
  if (!collection) {
    $('collectionDescriptionInput').value = '';
    renderMarkdownPane('collectionOverview');
    $('collectionPreRequestScriptInput').value = '';
    $('collectionTestScriptInput').value = '';
    $('collectionVariablesTable').textContent = '';
    $('collectionVariablePreview').textContent = 'No variables';
    renderCollectionAuthEditor({ type: 'none' });
    return;
  }
  collection.auth ||= { type: 'none' };
  collection.scripts ||= { preRequest: '', tests: '' };
  collection.variables ||= [];
  $('collectionDescriptionInput').value = collection.description || '';
  renderMarkdownPane('collectionOverview');
  renderCollectionAuthEditor(collection.auth);
  $('collectionPreRequestScriptInput').value = collection.scripts.preRequest || '';
  $('collectionTestScriptInput').value = collection.scripts.tests || '';
  renderCollectionVariablePairs(collection.variables || []);
  renderCollectionVariablePreview();
  updateCollectionEditorLanguages();
  refreshVariableHighlights($('collectionMainPanel'));
}

function renderFolderEditor() {
  const folder = activeFolder();
  renderFolderTitle(folder);
  const saveButton = $('saveFolderButton');
  if (saveButton) {
    saveButton.disabled = !folder;
  }
  const addVariableButton = $('addFolderVariableButton');
  if (addVariableButton) {
    addVariableButton.disabled = !folder;
  }
  if (!folder) {
    $('folderDescriptionInput').value = '';
    renderMarkdownPane('folderOverview');
    $('folderPreRequestScriptInput').value = '';
    $('folderTestScriptInput').value = '';
    $('folderVariablesTable').textContent = '';
    $('folderVariablePreview').textContent = 'No variables';
    renderFolderAuthEditor({ type: 'none' });
    return;
  }
  folder.auth ||= { type: 'none' };
  folder.scripts ||= { preRequest: '', tests: '' };
  folder.variables ||= [];
  $('folderDescriptionInput').value = folder.description || '';
  renderMarkdownPane('folderOverview');
  renderFolderAuthEditor(folder.auth);
  $('folderPreRequestScriptInput').value = folder.scripts.preRequest || '';
  $('folderTestScriptInput').value = folder.scripts.tests || '';
  renderFolderVariablePairs(folder.variables || []);
  renderFolderVariablePreview();
  updateFolderEditorLanguages();
  refreshVariableHighlights($('folderMainPanel'));
}

function renderCollectionTitle(collection) {
  const title = $('collectionMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    title.textContent = collection ? (collection.name || 'Untitled Collection') : 'Select a collection';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = collection ? 0 : -1;
  title.setAttribute('aria-disabled', collection ? 'false' : 'true');
  title.setAttribute('aria-label', 'Collection name');
}

function renderFolderTitle(folder) {
  const title = $('folderMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    title.textContent = folder ? (folder.name || 'Untitled Folder') : 'Select a folder';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = folder ? 0 : -1;
  title.setAttribute('aria-disabled', folder ? 'false' : 'true');
  title.setAttribute('aria-label', 'Folder name');
}

function renderRequestTitle(request) {
  const title = $('requestNameTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    title.textContent = request ? requestDisplayName(request) : 'Select a request';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = request ? 0 : -1;
  title.setAttribute('aria-disabled', request ? 'false' : 'true');
  title.setAttribute('aria-label', 'Request name');
}

function renderAuthEditor(auth) {
  syncActiveRequestAutoRefreshAuthTypeOption(auth);
  renderRequestAuthEditor(auth, {
    doc: document,
    showAuthSection
  });
  syncActiveRequestAutoRefreshAuthTypeOption(auth);
  syncRunnerRequestRefreshingAuthTypeLock(auth);
}

function renderCollectionAuthEditor(auth) {
  renderRequestAuthEditor(auth, {
    doc: document,
    idPrefix: 'collection',
    showAuthSection: showCollectionAuthSection
  });
}

function renderFolderAuthEditor(auth) {
  renderRequestAuthEditor(auth, {
    doc: document,
    idPrefix: 'folder',
    showAuthSection: showFolderAuthSection
  });
}

function showAuthSection(type) {
  for (const section of document.querySelectorAll('#authTab .auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
  syncActiveRequestAutoRefreshAuthTypeOption({ type });
}

function showCollectionAuthSection(type) {
  for (const section of document.querySelectorAll('#collectionAuthTab .auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
}

function showFolderAuthSection(type) {
  for (const section of document.querySelectorAll('#folderAuthTab .auth-section')) {
    section.classList.toggle('active', section.dataset.authSection === type);
  }
}

function syncActiveRequestAutoRefreshAuthTypeOption(auth = activeRequest()?.auth || { type: 'none' }) {
  const options = activeRequestRefreshingAuthOptions(auth);
  syncRefreshingAuthTypeOptions($('authTypeSelect'), options);
  syncRunnerRequestRefreshingAuthTypeLock(auth);
}

function syncActiveRequestAutoRefreshAuthTypeOptionWithConfig(auth = activeRequest()?.auth || { type: 'none' }, authRefresh = null) {
  const options = activeRequestRefreshingAuthOptions(auth, authRefresh);
  syncRefreshingAuthTypeOptions($('authTypeSelect'), options);
  syncRunnerRequestRefreshingAuthTypeLock(auth);
}

function syncRunnerRequestRefreshingAuthTypeLock(auth = activeRequest()?.auth || { type: 'none' }) {
  const select = $('authTypeSelect');
  if (!select) {
    return;
  }
  const managedCookie = activeRequestUsesRefreshingAuthCookie();
  if (managedCookie) {
    select.value = 'none';
    select.disabled = true;
    select.setAttribute('aria-disabled', 'true');
    select.title = 'Cookie refreshing auth uses the cookie jar, so request auth stays None.';
    return;
  }
  const locked = Boolean(activeRunnerRequestRunnerId) && auth?.type === AUTO_REFRESH_AUTH_TYPE;
  select.disabled = locked;
  select.setAttribute('aria-disabled', locked ? 'true' : 'false');
  select.title = locked
    ? 'Turn off Use refreshing access token on the runner row to change this auth type.'
    : '';
}

function syncPerformanceAutoRefreshAuthTypeOption(auth = activePerformanceTest()?.request?.auth || { type: 'none' }, authRefresh = activePerformanceTest()?.authRefresh) {
  const cookieMode = String(authRefresh?.authType || '').trim() === 'cookie';
  syncRefreshingAuthTypeOptions($('performanceAuthTypeSelect'), {
    authType: authRefresh?.authType,
    accessTokenAvailable: !cookieMode && performanceRefreshingAuthAccessTokenAvailable(auth, authRefresh),
    refreshTokenAvailable: false
  });
  syncPerformanceRefreshingAuthTypeLock(auth, authRefresh);
}

function performanceRefreshingAuthAccessTokenAvailable(auth = {}, authRefresh = {}) {
  if (auth?.type === AUTO_REFRESH_AUTH_TYPE) {
    return true;
  }
  const refreshType = String(authRefresh?.authType || '').trim();
  return authRefresh?.enabled === true && AUTO_REFRESH_SUPPORTED_AUTH_TYPES.has(refreshType);
}

function syncPerformanceRefreshingAuthTypeLock(auth = activePerformanceTest()?.request?.auth || { type: 'none' }, authRefresh = activePerformanceTest()?.authRefresh) {
  const select = $('performanceAuthTypeSelect');
  if (!select) {
    return;
  }
  const test = activePerformanceTest();
  if (!test) {
    select.disabled = true;
    select.setAttribute('aria-disabled', 'true');
    select.title = '';
    return;
  }
  const refreshType = String(authRefresh?.authType || '').trim();
  if (activePerformanceUsesRefreshingAuthCookie(authRefresh)) {
    select.value = 'none';
    select.disabled = true;
    select.setAttribute('aria-disabled', 'true');
    select.title = 'Cookie refreshing auth uses the cookie jar, so request auth stays None.';
    return;
  }
  const locked = authRefresh?.enabled === true
    && AUTO_REFRESH_SUPPORTED_AUTH_TYPES.has(refreshType)
    && auth?.type === AUTO_REFRESH_AUTH_TYPE;
  select.disabled = locked;
  select.setAttribute('aria-disabled', locked ? 'true' : 'false');
  select.title = locked
    ? 'Turn off Refreshing Auth to change this auth type.'
    : '';
}

function syncVisibleRefreshingAuthTypeOptionsForOwner(ownerType, authRefresh = null) {
  if (ownerType === 'performance') {
    syncPerformanceAutoRefreshAuthTypeOption(activePerformanceTest()?.request?.auth, authRefresh || activePerformanceTest()?.authRefresh);
    return;
  }
  const owner = activeAuthRefreshOwnerForType(ownerType);
  if (activeRunnerRequestRunnerId && owner?.id === activeRunnerRequestRunnerId) {
    syncActiveRequestAutoRefreshAuthTypeOptionWithConfig(activeRequest()?.auth, authRefresh || owner.authRefresh);
    return;
  }
  if (activeAuthRefreshRequestOwnerType === ownerType && owner?.id === activeAuthRefreshRequestOwnerId) {
    syncActiveRequestAutoRefreshAuthTypeOptionWithConfig(activeRequest()?.auth, authRefresh || owner.authRefresh);
  }
}

function syncRefreshingAuthTypeOptions(select, options = {}) {
  const authType = String(options.authType || '').trim();
  syncRefreshingAuthSelectOptions(select, {
    accessTokenValue: AUTO_REFRESH_AUTH_TYPE,
    accessTokenLabel: options.accessTokenLabel || refreshingAuthAccessTokenLabel(authType),
    accessTokenAvailable: options.accessTokenAvailable === true,
    refreshTokenValue: AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE,
    refreshTokenLabel: options.refreshTokenLabel || refreshingAuthRefreshTokenLabel(authType),
    refreshTokenAvailable: options.refreshTokenAvailable === true
  });
}

function showRefreshingAuthAccessTokenOption(select, authRefresh = null) {
  syncRefreshingAuthTypeOptions(select, {
    authType: authRefresh?.authType,
    accessTokenAvailable: true,
    refreshTokenAvailable: false
  });
}

function showRefreshingAuthRefreshTokenOption(select, authRefresh = null) {
  syncRefreshingAuthTypeOptions(select, {
    authType: authRefresh?.authType,
    accessTokenAvailable: false,
    refreshTokenAvailable: true
  });
}

function refreshingAuthAccessTokenLabel(authType = '') {
  const normalizedType = String(authType || '').trim();
  if (normalizedType === 'cookie') {
    return REFRESHING_AUTH_ACCESS_COOKIE_LABEL;
  }
  if (normalizedType === 'apiKey') {
    return REFRESHING_AUTH_API_KEY_LABEL;
  }
  return REFRESHING_AUTH_ACCESS_TOKEN_LABEL;
}

function refreshingAuthRefreshTokenLabel(authType = '') {
  return String(authType || '').trim() === 'cookie'
    ? REFRESHING_AUTH_REFRESH_COOKIE_LABEL
    : REFRESHING_AUTH_REFRESH_TOKEN_LABEL;
}

function activeRequestRefreshingAuthOptions(auth = {}, authRefreshOverride = null) {
  if (activeRunnerRequestRunnerId) {
    const runner = (workspace?.runners || []).find((item) => item.id === activeRunnerRequestRunnerId);
    const authRefresh = authRefreshOverride || runner?.authRefresh;
    if (String(authRefresh?.authType || '').trim() === 'cookie') {
      return {
        authType: authRefresh?.authType,
        accessTokenAvailable: false,
        refreshTokenAvailable: false
      };
    }
    return {
      authType: authRefresh?.authType,
      accessTokenAvailable: refreshingAuthAccessTokenAvailable(auth, authRefresh),
      refreshTokenAvailable: false
    };
  }
  if (activeAuthRefreshRequestOwnerType && activeAuthRefreshRequestOwnerId) {
    const owner = authRefreshOwner(activeAuthRefreshRequestOwnerType, activeAuthRefreshRequestOwnerId);
    const authRefresh = authRefreshOverride || owner?.authRefresh;
    const property = authRefreshRequestPropertyForId(authRefresh, activeRequestId);
    if (String(authRefresh?.authType || '').trim() === 'cookie') {
      return {
        authType: authRefresh?.authType,
        accessTokenAvailable: false,
        refreshTokenAvailable: false
      };
    }
    return {
      authType: authRefresh?.authType,
      accessTokenAvailable: false,
      refreshTokenAvailable: property === 'request'
        && (refreshingAuthRefreshTokenAvailable(authRefresh) || auth?.type === AUTO_REFRESH_REFRESH_TOKEN_AUTH_TYPE)
    };
  }
  return {
    accessTokenAvailable: false,
    refreshTokenAvailable: false
  };
}

function refreshingAuthAccessTokenAvailable(auth = {}, authRefresh = {}) {
  const refreshType = String(authRefresh?.authType || '').trim();
  if (authRefresh?.enabled !== true || !AUTO_REFRESH_SUPPORTED_AUTH_TYPES.has(refreshType)) {
    return false;
  }
  const authType = String(auth?.type || 'none').trim();
  return authType === AUTO_REFRESH_AUTH_TYPE || authType === refreshType;
}

function refreshingAuthRefreshTokenAvailable(authRefresh = {}) {
  return authRefresh?.enabled === true && authRefreshRequestConfigured(authRefresh?.refreshTokenRequest);
}

function activeRequestUsesRefreshingAuthCookie(request = activeRequest()) {
  if (!request) {
    return false;
  }
  if (activeRunnerRequestRunnerId) {
    const runner = (workspace?.runners || []).find((item) => item.id === activeRunnerRequestRunnerId);
    return runner?.authRefresh?.enabled === true
      && runnerAuthRefreshIsCookie(runner)
      && request.useRefreshingAuthCookie === true;
  }
  if (activeAuthRefreshRequestOwnerType && activeAuthRefreshRequestOwnerId) {
    const owner = authRefreshOwner(activeAuthRefreshRequestOwnerType, activeAuthRefreshRequestOwnerId);
    const authRefresh = owner?.authRefresh;
    return authRefresh?.enabled === true
      && String(authRefresh.authType || '').trim() === 'cookie'
      && authRefreshRequestPropertyForId(authRefresh, activeRequestId) === 'request'
      && refreshingAuthRefreshTokenAvailable(authRefresh)
      && request.useRefreshingAuthCookie === true;
  }
  return false;
}

function applyActiveRequestRefreshingCookieState(request = activeRequest()) {
  if (!request) {
    return false;
  }
  if (activeRunnerRequestRunnerId && !activeRequestUsesRefreshingAuthCookie(request)) {
    return false;
  }
  if (activeAuthRefreshRequestOwnerType && activeAuthRefreshRequestOwnerId) {
    const owner = authRefreshOwner(activeAuthRefreshRequestOwnerType, activeAuthRefreshRequestOwnerId);
    const authRefresh = owner?.authRefresh;
    const shouldManage = authRefresh?.enabled === true
      && String(authRefresh.authType || '').trim() === 'cookie'
      && authRefreshRequestPropertyForId(authRefresh, activeRequestId) === 'request'
      && refreshingAuthRefreshTokenAvailable(authRefresh);
    if (!shouldManage) {
      return false;
    }
    if (request.useRefreshingAuthCookie !== true) {
      request.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(request.auth);
      request.useRefreshingAuthCookie = true;
    }
  } else if (!activeRequestUsesRefreshingAuthCookie(request)) {
    return false;
  }
  request.auth = { type: 'none' };
  request.cookieJar = {
    ...(request.cookieJar || {}),
    enabled: true,
    storeResponses: true
  };
  return true;
}

function applyPerformanceRefreshingCookieState(test = activePerformanceTest()) {
  if (!test?.request || !activePerformanceUsesRefreshingAuthCookie(test.authRefresh)) {
    return false;
  }
  if (test.request.useRefreshingAuthCookie !== true) {
    test.request.refreshingAuthOriginalAuth = normalizeRefreshingAuthOriginalAuth(test.request.auth);
    test.request.useRefreshingAuthCookie = true;
  }
  test.request.auth = { type: 'none' };
  test.request.cookieJar = {
    ...(test.request.cookieJar || {}),
    enabled: true,
    storeResponses: true
  };
  return true;
}

function activePerformanceUsesRefreshingAuthCookie(authRefresh = activePerformanceTest()?.authRefresh) {
  return authRefresh?.enabled === true && String(authRefresh.authType || '').trim() === 'cookie';
}

function renderRequestPairsForContext(contextOrScope, containerId, pairs, fieldName) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  renderEditorRequestPairs({
    doc: document,
    containerId,
    pairs,
    onDirty: () => {
      if (fieldName === 'queryParams') {
        syncRequestUrlInputFromParamsForContext(context);
      }
      collectRequestEditorAndMarkDirtyForContext(context);
    },
    onRemove: () => {
      renderRequestEditorForContextScope(context);
    }
  });
  bindRequestPairTableSync(context, containerId, fieldName);
}

function renderPairs(containerId, pairs, fieldName) {
  renderRequestPairsForContext('request', containerId, pairs, fieldName);
}

function renderRequestHeaderPairsForContext(contextOrScope, containerId, request) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  renderEditorRequestPairs({
    doc: document,
    containerId,
    pairs: request?.headers || [],
    onDirty: () => {
      collectRequestEditorAndMarkDirtyForContext(context);
      renderGeneratedHeaderRows(containerId, request);
      renderRequestHeaderControlsForContext(context, request);
    },
    onRemove: () => {
      renderRequestEditorForContextScope(context);
    }
  });
  renderGeneratedHeaderRows(containerId, request);
  renderRequestHeaderControlsForContext(context, request);
  bindRequestPairTableSync(context, containerId, 'headers');
}

function renderHeaderPairs(containerId, request) {
  renderRequestHeaderPairsForContext('request', containerId, request);
}

function collectRequestEditorAndMarkDirtyForContext(context) {
  if (context.scope === 'performance') {
    collectPerformanceTestFromEditor();
    markRequestEditorContextDirty(context);
    return;
  }
  collectRequestFromEditor();
  markRequestEditorContextDirty(context);
}

function renderRequestEditorForContextScope(context) {
  if (context.scope === 'performance') {
    renderPerformanceRequestEditor();
    return;
  }
  renderRequestEditor();
}

function renderRequestHeaderControlsForContext(contextOrScope, request) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  renderAutoHeaderControls({
    request,
    tokenInputId: context.autoHeaderTokenInputId,
    showInputId: context.autoHeaderShowInputId,
    labelId: context.autoHeaderLabelId
  });
}

function bindRequestPairTableSync(context, containerId, fieldName) {
  const container = $(containerId);
  if (!container) {
    return;
  }
  const sync = (event) => {
    if (!event?.target?.matches?.('input')) {
      return;
    }
    syncRequestPairsFromTableForContext(context, containerId, fieldName);
  };
  container.oninput = sync;
  container.onchange = sync;
}

function syncRequestPairsFromTableForContext(context, containerId, fieldName) {
  const request = activeRequestForEditorContext(context);
  if (!request) {
    return;
  }
  if (fieldName === 'queryParams') {
    syncRequestUrlInputFromParamsForContext(context);
  } else if (fieldName) {
    request[fieldName] = collectKeyValueRowsFromTable(containerId, request[fieldName]);
  }
  markRequestEditorContextDirty(context);
  if (fieldName === 'headers') {
    renderGeneratedHeaderRows(containerId, request);
    renderRequestHeaderControlsForContext(context, request);
  }
  refreshVariableHighlights();
}

function renderRequestHeaderControls(request) {
  renderRequestHeaderControlsForContext('request', request);
}

function renderRequestTlsSettings(request) {
  renderRequestSettingsControls(request, 'request');
}

function renderPerformanceRequestTlsSettings(request) {
  renderRequestSettingsControls(request, 'performance');
}

function requestSettingsControlIds(scope = 'request') {
  const prefix = scope === 'performance' ? 'performanceRequest' : 'request';
  return {
    sslCertificateVerification: `${prefix}SslCertificateVerificationInput`,
    sslCertificateVerificationInheritActions: `${prefix}SslCertificateVerificationInheritActions`,
    httpVersion: `${prefix}HttpVersionSelect`,
    followRedirects: `${prefix}FollowRedirectsInput`,
    maxRedirects: `${prefix}MaxRedirectsInput`,
    followOriginalHttpMethod: `${prefix}FollowOriginalHttpMethodInput`,
    followAuthorizationHeader: `${prefix}FollowAuthorizationHeaderInput`,
    removeRefererHeaderOnRedirect: `${prefix}RemoveRefererHeaderOnRedirectInput`,
    strictHttpParser: `${prefix}StrictHttpParserInput`,
    encodeUrlAutomatically: `${prefix}EncodeUrlAutomaticallyInput`,
    useServerCipherSuiteDuringHandshake: `${prefix}UseServerCipherSuiteInput`,
    disabledTlsProtocols: `${prefix}DisabledTlsProtocolsInput`,
    cipherSuiteSelection: `${prefix}CipherSuiteSelectionInput`
  };
}

function requestSettingsScopeFromInputId(inputId = '') {
  return String(inputId || '').startsWith('performance') ? 'performance' : 'request';
}

function renderRequestSettingsControls(request, scope = 'request') {
  const settings = request ? normalizeRendererRequestTlsSettings(request.settings) : normalizeRendererRequestTlsSettings();
  const ids = requestSettingsControlIds(scope);
  const verification = $(ids.sslCertificateVerification);
  if (verification) {
    verification.value = settings.sslCertificateVerification;
    verification.dataset.verificationValue = settings.sslCertificateVerification;
    verification.disabled = !request;
  }
  const inheritActions = $(ids.sslCertificateVerificationInheritActions);
  if (inheritActions) {
    inheritActions.hidden = !request || settings.sslCertificateVerification !== 'inherit';
  }
  setSelectValue(ids.httpVersion, settings.httpVersion, !request);
  setCheckboxValue(ids.followRedirects, settings.followRedirects, !request);
  setNumberInputValue(ids.maxRedirects, settings.maxRedirects, !request);
  setCheckboxValue(ids.followOriginalHttpMethod, settings.followOriginalHttpMethod, !request);
  setCheckboxValue(ids.followAuthorizationHeader, settings.followAuthorizationHeader, !request);
  setCheckboxValue(ids.removeRefererHeaderOnRedirect, settings.removeRefererHeaderOnRedirect, !request);
  setCheckboxValue(ids.strictHttpParser, settings.strictHttpParser, !request);
  setCheckboxValue(ids.encodeUrlAutomatically, settings.encodeUrlAutomatically, !request);
  setCheckboxValue(ids.useServerCipherSuiteDuringHandshake, settings.useServerCipherSuiteDuringHandshake, !request);
  setTextInputValue(ids.disabledTlsProtocols, settings.disabledTlsProtocols, !request);
  setTextInputValue(ids.cipherSuiteSelection, settings.cipherSuiteSelection, !request);
}

function setSelectValue(id, value, disabled = false) {
  const input = $(id);
  if (!input) {
    return;
  }
  input.value = value;
  input.disabled = disabled;
}

function setCheckboxValue(id, checked, disabled = false) {
  const input = $(id);
  if (!input) {
    return;
  }
  input.checked = checked === true;
  input.disabled = disabled;
}

function setNumberInputValue(id, value, disabled = false) {
  const input = $(id);
  if (!input) {
    return;
  }
  input.value = String(value ?? '');
  input.disabled = disabled;
}

function setTextInputValue(id, value, disabled = false) {
  const input = $(id);
  if (!input) {
    return;
  }
  input.value = value == null ? '' : String(value);
  input.disabled = disabled;
}

function renderPerformanceRequestHeaderControls(request) {
  renderRequestHeaderControlsForContext('performance', request);
}

function renderAutoHeaderControls({ request, tokenInputId, showInputId, labelId }) {
  const autoHeaders = request ? ensureRequestAutoHeaders(request) : { sendPostMeterToken: false, showGeneratedHeaders: false };
  const generatedCount = request ? generatedRequestHeaders(request).length : 0;
  const tokenInput = $(tokenInputId);
  if (tokenInput) {
    tokenInput.checked = autoHeaders.sendPostMeterToken === true;
    tokenInput.disabled = !request;
  }
  const showInput = $(showInputId);
  if (showInput) {
    showInput.checked = autoHeaders.showGeneratedHeaders === true;
    showInput.disabled = !request || generatedCount === 0;
  }
  const label = $(labelId);
  if (label) {
    label.textContent = autoHeaders.showGeneratedHeaders
      ? `Hide auto-generated headers (${generatedCount})`
      : `Show auto-generated headers (${generatedCount})`;
  }
}

function renderGeneratedHeaderRows(containerId, request) {
  const container = $(containerId);
  if (!container) {
    return;
  }
  for (const row of container.querySelectorAll('[data-generated-header="true"]')) {
    row.remove();
  }
  if (!request) {
    return;
  }
  const autoHeaders = ensureRequestAutoHeaders(request);
  if (!autoHeaders.showGeneratedHeaders) {
    return;
  }
  for (const header of generatedRequestHeaders(request)) {
    container.append(createGeneratedHeaderRow(header));
  }
  refreshVariableHighlights(container);
}

function createGeneratedHeaderRow(header) {
  const row = document.createElement('div');
  row.className = 'kv-row generated-header-row';
  row.dataset.generatedHeader = 'true';
  row.title = 'Auto-generated when the request is sent';

  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = true;
  enabled.disabled = true;

  const key = document.createElement('input');
  key.value = header.key;
  key.readOnly = true;
  key.setAttribute('aria-label', `Auto-generated ${header.key} header`);

  const value = document.createElement('input');
  value.value = header.value;
  value.readOnly = true;
  value.setAttribute('aria-label', `Auto-generated ${header.key} header value`);

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.textContent = 'Auto';
  badge.disabled = true;

  row.append(enabled, key, value, badge);
  return row;
}

function generatedRequestHeaders(request) {
  const headers = [];
  addGeneratedHeader(headers, request, 'Accept', '*/*');
  addGeneratedHeader(headers, request, 'User-Agent', POSTMETER_USER_AGENT);
  addGeneratedHeader(headers, request, 'Host', generatedHostHeaderValue(request));
  addGeneratedHeader(headers, request, 'Accept-Encoding', 'gzip, deflate, br');
  addGeneratedHeader(headers, request, 'Connection', 'keep-alive');
  if (ensureRequestAutoHeaders(request).sendPostMeterToken) {
    addGeneratedHeader(headers, request, 'PostMeter-Token', AUTO_HEADER_PLACEHOLDER);
  }
  if (requestSendsBody(request)) {
    addGeneratedHeader(headers, request, 'Content-Type', defaultGeneratedContentTypeForRequest(request));
    addGeneratedHeader(headers, request, 'Content-Length', AUTO_HEADER_PLACEHOLDER);
  }
  for (const header of generatedAuthHeaders(request)) {
    addGeneratedHeader(headers, request, header.key, header.value);
  }
  return headers;
}

function addGeneratedHeader(headers, request, key, value) {
  if (!key || enabledHeaderValue(request, key) != null) {
    return;
  }
  headers.push({ key, value });
}

function generatedAuthHeaders(request) {
  const folderAuth = effectiveFolderAuthForPath(activeFolderPathForActiveRequest());
  const auth = requestHasOwnAuth(request?.auth)
    ? request.auth
    : requestHasOwnAuth(folderAuth)
      ? folderAuth
      : (activeCollection()?.auth || request?.auth || {});
  const type = auth.type || 'none';
  if (['bearer', 'basic', 'oauth2', 'digest', 'hawk', 'aws', 'oauth1', 'ntlm', 'akamaiEdgeGrid', 'jwtBearer', 'asap'].includes(type)) {
    return [{ key: 'Authorization', value: AUTO_HEADER_PLACEHOLDER }];
  }
  if (type === 'apiKey' && (auth.location || 'header') !== 'query' && String(auth.key || '').trim()) {
    return [{ key: String(auth.key).trim(), value: AUTO_HEADER_PLACEHOLDER }];
  }
  if (type === 'cookie') {
    return [{ key: 'Cookie', value: AUTO_HEADER_PLACEHOLDER }];
  }
  return [];
}

function requestHasOwnAuth(auth) {
  return Boolean(auth && typeof auth === 'object' && String(auth.type || 'none') !== 'none');
}

function enabledHeaderValue(request, key) {
  const target = String(key || '').toLowerCase();
  const pair = (request?.headers || []).find((header) => header?.enabled !== false && String(header.key || '').trim().toLowerCase() === target);
  return pair ? String(pair.value ?? '') : null;
}

function generatedHostHeaderValue(request) {
  const url = parsedRequestUrlForHeader(request?.url);
  return url ? url.host : AUTO_HEADER_PLACEHOLDER;
}

function parsedRequestUrlForHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const urlText = raw.startsWith('//')
    ? `http:${raw}`
    : /^[A-Za-z][A-Za-z\d+.-]*:/.test(raw)
      ? raw
      : `http://${raw}`;
  try {
    return new URL(urlText);
  } catch {
    return null;
  }
}

function requestSendsBody(request) {
  return BODY_METHOD_SET.has(String(request?.method || '').toUpperCase()) && String(request?.bodyType || 'NONE') !== 'NONE';
}

function defaultGeneratedContentTypeForRequest(request) {
  if (request?.bodyType === 'BINARY') {
    return detectFileContentType(binaryBodyForRequest(request).source);
  }
  return defaultGeneratedContentType(request?.bodyType);
}

function defaultGeneratedContentType(bodyType) {
  if (bodyType === 'RAW_JSON') {
    return 'application/json';
  }
  if (bodyType === 'RAW_JAVASCRIPT') {
    return 'application/javascript';
  }
  if (bodyType === 'RAW_HTML') {
    return 'text/html; charset=utf-8';
  }
  if (bodyType === 'RAW_XML') {
    return 'application/xml';
  }
  if (bodyType === 'URLENCODED') {
    return 'application/x-www-form-urlencoded';
  }
  if (bodyType === 'BINARY') {
    return 'application/octet-stream';
  }
  if (bodyType === 'FORM_DATA') {
    return 'multipart/form-data; boundary=<calculated when request is sent>';
  }
  return 'text/plain; charset=utf-8';
}

function detectFileContentType(value) {
  const raw = String(value || '').split(/[?#]/, 1)[0];
  const dotIndex = raw.lastIndexOf('.');
  if (dotIndex < 0) {
    return 'application/octet-stream';
  }
  const slashIndex = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  if (slashIndex > dotIndex) {
    return 'application/octet-stream';
  }
  return FILE_EXTENSION_CONTENT_TYPES.get(raw.slice(dotIndex).toLowerCase()) || 'application/octet-stream';
}

function ensureRequestAutoHeaders(request) {
  request.autoHeaders = {
    sendPostMeterToken: request?.autoHeaders?.sendPostMeterToken === true,
    showGeneratedHeaders: request?.autoHeaders?.showGeneratedHeaders === true
  };
  return request.autoHeaders;
}

function renderEnvironmentSelect() {
  const select = $('environmentSelect');
  if (activeEnvironmentId !== 'none' && !(workspace.environments || []).some((environment) => environment.id === activeEnvironmentId)) {
    activeEnvironmentId = 'none';
  }
  select.textContent = '';
  select.append(new Option('No Environment', 'none'));
  for (const environment of workspace.environments || []) {
    select.append(new Option(environment.name, environment.id));
  }
  select.value = activeEnvironmentId;
}

function renderEnvironmentEditor() {
  if (activeEnvironmentEditorId !== 'none' && !(workspace.environments || []).some((environment) => environment.id === activeEnvironmentEditorId)) {
    activeEnvironmentEditorId = 'none';
  }
  const environment = activeEditorEnvironment();
  const title = $('environmentMainTitle');
  if (title.dataset.editing !== 'true') {
    title.textContent = environment?.name || 'Select an environment';
    title.setAttribute('contenteditable', 'false');
    title.removeAttribute('role');
    title.classList.remove('is-editing');
  }
  title.tabIndex = environment ? 0 : -1;
  title.setAttribute('aria-disabled', environment ? 'false' : 'true');
  title.setAttribute('aria-label', 'Environment name');
  $('saveEnvironmentButton').disabled = !environment;
  $('deleteEnvironmentButton').disabled = !environment;
  $('addVariableButton').disabled = !environment;
  $('setEnvironmentButton').disabled = !environment;
  if (!environment) {
    const container = $('environmentTable');
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Select or create an environment';
    container.append(empty);
  } else {
    renderEnvironmentPairs(environment.variables || []);
  }
  renderVariablePreview();
  refreshVariableHighlights($('environmentMainPanel'));
}

function resetRequestEditorTransientStateOnContextChange() {
  const contextKey = `${activeCollectionId || 'draft'}:${activeRequestId || ''}`;
  if (contextKey === lastRenderedRequestEditorContextKey) {
    return;
  }
  lastRenderedRequestEditorContextKey = contextKey;
  if (activeOauthFlowId) {
    return;
  }
  $('validationLabel').textContent = '';
  resetOauthProgressPanel();
}

function resetOauthProgressPanel() {
  const panel = $('oauthProgressPanel');
  if (!panel) {
    return;
  }
  panel.hidden = true;
  $('oauthProgressStatus').textContent = 'Idle';
  $('oauthProgressDetail').textContent = '';
}

function renderCollectionVariablesEditor() {
  renderCollectionVariablePreview();
  renderFolderVariablePreview();
  renderVariablePreview();
}

function renderFolderVariablesEditor() {
  renderFolderVariablePreview();
  renderVariablePreview();
}

function renderCollectionVariablePairs(pairs) {
  renderEditorVariablePairs({
    doc: document,
    containerId: 'collectionVariablesTable',
    pairs,
    onChange: () => {
      collectCollectionFromEditor({ includeVariables: false });
      markActiveCollectionTabDirty();
      renderCollectionVariablePreview();
      renderVariablePreview();
      refreshVariableHighlights();
    },
    onRemove: () => {
      markActiveCollectionTabDirty();
      renderCollectionEditor();
      renderVariablePreview();
      refreshVariableHighlights();
    }
  });
}

function renderCollectionVariablePreview() {
  renderEditorVariablePreview({
    collection: activeCollection(),
    containerId: 'collectionVariablePreview',
    doc: document
  });
}

function renderFolderVariablePairs(pairs) {
  renderEditorVariablePairs({
    doc: document,
    containerId: 'folderVariablesTable',
    pairs,
    onChange: () => {
      collectFolderFromEditor({ includeVariables: false });
      markActiveFolderTabDirty();
      renderFolderVariablePreview();
      renderVariablePreview();
      refreshVariableHighlights();
    },
    onRemove: () => {
      markActiveFolderTabDirty();
      renderFolderEditor();
      renderVariablePreview();
      refreshVariableHighlights();
    }
  });
}

function renderFolderVariablePreview() {
  renderEditorVariablePreview({
    collection: activeCollection(),
    containerId: 'folderVariablePreview',
    doc: document,
    folder: activeFolder(),
    folders: activeFolderPathForActiveRequest()
  });
}

function renderRequestVariablePairs(pairs) {
  renderRequestVariablePairsForContext('request', pairs);
}

function renderRequestVariablePairsForContext(contextOrScope, pairs) {
  const context = typeof contextOrScope === 'string' ? requestEditorContext(contextOrScope) : contextOrScope;
  renderEditorVariablePairs({
    doc: document,
    containerId: context.variablesTableId,
    pairs,
    onChange: () => {
      markRequestEditorContextDirty(context);
      renderRequestVariablePreviewForContext(context);
      refreshVariableHighlights();
    },
    onRemove: () => {
      syncRequestVariablesFromTableForContext(context);
    }
  });
  bindRequestVariableTableSync(context);
}

function bindRequestVariableTableSync(context) {
  const container = $(context.variablesTableId);
  if (!container) {
    return;
  }
  const sync = (event) => {
    if (!event?.target?.matches?.('input')) {
      return;
    }
    syncRequestVariablesFromTableForContext(context);
  };
  container.oninput = sync;
  container.onchange = sync;
}

function syncRequestVariablesFromTableForContext(context) {
  const request = activeRequestForEditorContext(context);
  if (!request) {
    return;
  }
  request.variables = collectKeyValueRowsFromTable(context.variablesTableId, request.variables);
  markRequestEditorContextDirty(context);
  renderRequestVariablePreviewForContext(context);
  refreshVariableHighlights();
}

function renderVariablePreview() {
  renderEditorVariablePreview({
    doc: document,
    collection: activeCollection(),
    environment: activeMainPanel === 'environment' ? activeEditorEnvironment() : activeEnvironment(),
    folder: activeFolderForActiveRequest(),
    folders: activeFolderPathForActiveRequest(),
    request: activeRequest()
  });
}

function renderCookieJarEditor() {
  renderRequestCookieJarEditor({
    doc: document,
    workspace,
    activeRequestUrl: activeRequest()?.url || '',
    managedCookieNames: activeRequestManagedRefreshingCookieNames(),
    onDirty: markCookieJarDirty,
    rerender: renderCookieJarEditor,
    setStatus
  });
}

function renderWorkspaceCookieManager() {
  const list = $('cookiesDomainList');
  if (!list || !workspace) {
    return;
  }
  workspace.cookies ||= [];
  const activeHost = domainFromRequestUrl(activeCookieManagerRequestUrl());
  const managedCookieNames = cookieManagerManagedCookieNameSet();
  ensureCookieManagerManagedCookies(activeHost, managedCookieNames);
  renderCookieManagerError();
  list.textContent = '';

  if (cookieManagerSelectedCookieIndex >= workspace.cookies.length) {
    resetCookieManagerEditor();
  }

  const domains = cookieManagerDomains();
  if (!domains.length) {
    const empty = document.createElement('div');
    empty.className = 'cookie-manager-empty';
    empty.textContent = 'No cookie domains.';
    list.append(empty);
    return;
  }

  for (const domain of domains) {
    renderCookieDomainSection(list, domain, managedCookieNames, activeHost);
  }
}

function activeCookieManagerRequestUrl() {
  if (activeMainPanel === 'performance') {
    return activePerformanceTest()?.request?.url || '';
  }
  return activeRequest()?.url || '';
}

function activeCookieManagerManagedCookieNames() {
  if (activeMainPanel === 'performance') {
    return performanceManagedRefreshingCookieNames();
  }
  return activeRequestManagedRefreshingCookieNames();
}

function cookieManagerManagedCookieNameSet() {
  return new Set(activeCookieManagerManagedCookieNames()
    .map((name) => String(name || '').trim())
    .filter(Boolean));
}

function ensureCookieManagerManagedCookies(activeHost, managedCookieNames) {
  if (!activeHost || !managedCookieNames?.size) {
    return;
  }
  workspace.cookies ||= [];
  for (const name of managedCookieNames) {
    const exists = workspace.cookies.some((cookie) => String(cookie?.name || '').trim() === name
      && rendererCookieMatchesHost(cookie, activeHost));
    if (exists) {
      continue;
    }
    workspace.cookies.push(newWorkspaceCookie({
      name,
      value: '',
      domain: activeHost,
      path: '/',
      hostOnly: true,
      httpOnly: true,
      sameSite: 'Lax',
      source: 'auth-refresh'
    }));
  }
}

function cookieManagerDomains() {
  const domains = new Set();
  for (const cookie of workspace.cookies || []) {
    const domain = normalizeCookieManagerDomain(cookie?.domain);
    if (domain) {
      domains.add(domain);
    }
  }
  for (const domain of cookieManagerExtraDomains) {
    const normalized = normalizeCookieManagerDomain(domain);
    if (normalized) {
      domains.add(normalized);
    }
  }
  return Array.from(domains).sort((left, right) => left.localeCompare(right));
}

function renderCookieDomainSection(container, domain, managedCookieNames, activeHost) {
  const cookies = (workspace.cookies || [])
    .map((cookie, index) => ({ cookie, index }))
    .filter(({ cookie }) => normalizeCookieManagerDomain(cookie?.domain) === domain);
  const details = document.createElement('details');
  details.className = 'cookie-domain-section';
  details.dataset.cookieDomain = domain;
  details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'cookie-domain-summary';
  const name = document.createElement('span');
  name.className = 'cookie-domain-name';
  name.textContent = domain;
  const count = document.createElement('span');
  count.className = 'cookie-domain-count';
  count.textContent = `${cookies.length} ${cookies.length === 1 ? 'cookie' : 'cookies'}`;
  const removeDomain = document.createElement('button');
  removeDomain.type = 'button';
  removeDomain.className = 'cookie-domain-remove-button';
  removeDomain.dataset.cookieDomain = domain;
  removeDomain.textContent = 'x';
  removeDomain.setAttribute('aria-label', `Remove domain ${domain}`);
  removeDomain.title = `Remove ${domain} and all of its cookies`;
  removeDomain.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeCookieManagerDomain(domain);
  });
  summary.append(name, count, removeDomain);

  const body = document.createElement('div');
  body.className = 'cookie-domain-body';
  const cookieList = document.createElement('div');
  cookieList.className = 'cookie-name-list';

  cookies.forEach(({ cookie, index }, ordinal) => {
    const managed = cookieManagerCookieIsManaged(cookie, managedCookieNames, activeHost);
    const item = document.createElement('span');
    item.className = 'cookie-name-item';
    item.dataset.cookieName = cookie.name || `Cookie ${ordinal + 1}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cookie-name-button';
    button.dataset.cookieName = cookie.name || `Cookie ${ordinal + 1}`;
    button.classList.toggle('is-active', cookieManagerSelectedCookieIndex === index);
    button.classList.toggle('is-managed', managed);
    button.textContent = cookie.name || `Cookie ${ordinal + 1}`;
    button.disabled = managed;
    button.title = managed ? 'Managed by Refreshing Auth for this request.' : '';
    button.addEventListener('click', () => openCookieManagerEditor(index));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cookie-remove-button';
    remove.dataset.cookieName = cookie.name || `Cookie ${ordinal + 1}`;
    remove.textContent = 'x';
    remove.disabled = managed;
    remove.setAttribute('aria-label', `Remove cookie ${cookie.name || ordinal + 1}`);
    remove.title = managed ? 'Managed by Refreshing Auth for this request.' : 'Remove cookie';
    remove.addEventListener('click', () => removeCookieManagerCookie(index));
    item.append(button, remove);
    cookieList.append(item);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'cookie-add-inline-button';
  add.dataset.cookieDomain = domain;
  add.textContent = '+ Add Cookie';
  add.addEventListener('click', () => addCookieToDomain(domain));
  cookieList.append(add);
  body.append(cookieList);

  if (cookieManagerSelectedCookieIndex >= 0) {
    const selected = workspace.cookies[cookieManagerSelectedCookieIndex];
    if (selected && normalizeCookieManagerDomain(selected.domain) === domain) {
      body.append(renderCookieTextEditor(cookieManagerSelectedCookieIndex, domain));
    }
  }

  details.append(summary, body);
  container.append(details);
}

function renderCookieTextEditor(index, fallbackDomain) {
  const cookie = workspace.cookies[index];
  const editor = document.createElement('div');
  editor.className = 'cookie-text-editor';
  editor.dataset.cookieDomain = normalizeCookieManagerDomain(fallbackDomain);
  const textarea = document.createElement('textarea');
  textarea.id = 'cookieManagerCookieTextInput';
  textarea.value = cookieManagerDraftText || cookieToSetCookieText(cookie, fallbackDomain);
  textarea.spellcheck = false;
  textarea.setAttribute('aria-label', `Cookie ${cookie?.name || index + 1} text`);
  textarea.addEventListener('input', () => {
    cookieManagerDraftText = textarea.value;
  });

  const actions = document.createElement('div');
  actions.className = 'cookie-text-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    resetCookieManagerEditor();
    renderWorkspaceCookieManager();
  });
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.textContent = 'Save';
  save.addEventListener('click', () => saveCookieManagerDraft(index, fallbackDomain));
  actions.append(cancel, save);
  editor.append(textarea, actions);
  return editor;
}

function cookieManagerCookieIsManaged(cookie, managedCookieNames, activeHost) {
  return managedCookieNames.has(String(cookie?.name || '').trim())
    && (!activeHost || rendererCookieMatchesHost(cookie, activeHost));
}

function openCookieManagerEditor(index) {
  const cookie = workspace.cookies?.[index];
  if (!cookie) {
    return;
  }
  cookieManagerSelectedCookieIndex = index;
  cookieManagerDraftText = cookieToSetCookieText(cookie, cookie.domain);
  cookieManagerErrorMessage = '';
  renderWorkspaceCookieManager();
}

function resetCookieManagerEditor() {
  cookieManagerSelectedCookieIndex = -1;
  cookieManagerDraftText = '';
  cookieManagerErrorMessage = '';
}

function renderCookieManagerError() {
  const error = $('cookiesModalError');
  if (!error) {
    return;
  }
  error.textContent = cookieManagerErrorMessage;
  error.hidden = !cookieManagerErrorMessage;
}

function setCookieManagerError(message) {
  cookieManagerErrorMessage = String(message || '');
  renderCookieManagerError();
}

function cookieToSetCookieText(cookie, fallbackDomain = '') {
  if (!cookie) {
    return '';
  }
  const name = String(cookie.name || '');
  const value = String(cookie.value || '');
  const parts = [`${name}=${value}`];
  const path = String(cookie.path || '/').trim() || '/';
  parts.push(`Path=${path.startsWith('/') ? path : `/${path}`}`);
  if (cookie.expiresAt) {
    const expires = new Date(cookie.expiresAt);
    parts.push(`Expires=${Number.isNaN(expires.getTime()) ? cookie.expiresAt : expires.toUTCString()}`);
  }
  const domain = normalizeCookieManagerDomain(cookie.domain || fallbackDomain);
  if (cookie.hostOnly === false && domain) {
    parts.push(`Domain=${domain}`);
  }
  if (cookie.secure === true) {
    parts.push('Secure');
  }
  if (cookie.httpOnly === true) {
    parts.push('HttpOnly');
  }
  if (cookie.sameSite) {
    parts.push(`SameSite=${cookie.sameSite}`);
  }
  if (cookie.priority) {
    parts.push(`Priority=${cookie.priority}`);
  }
  if (cookie.partitioned === true) {
    parts.push('Partitioned');
  }
  if (cookie.enabled === false) {
    parts.push('Enabled=false');
  }
  for (const extension of cookie.extensions || []) {
    if (extension) {
      parts.push(String(extension));
    }
  }
  return `${parts.join('; ')};`;
}

function parseSetCookieTextForManager(text, fallbackDomain) {
  const parts = String(text || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) {
    throw new Error('Cookie text is required.');
  }
  const firstSeparator = parts[0].indexOf('=');
  if (firstSeparator <= 0) {
    throw new Error('Cookie text must start with name=value.');
  }
  const cookie = {
    enabled: true,
    name: parts[0].slice(0, firstSeparator).trim(),
    value: parts[0].slice(firstSeparator + 1).trim(),
    domain: normalizeCookieManagerDomain(fallbackDomain),
    path: '/',
    expiresAt: '',
    secure: false,
    httpOnly: false,
    sameSite: '',
    hostOnly: true,
    priority: '',
    partitioned: false,
    extensions: []
  };
  if (!cookie.name) {
    throw new Error('Cookie name is required.');
  }

  for (const rawAttribute of parts.slice(1)) {
    const separator = rawAttribute.indexOf('=');
    const key = (separator >= 0 ? rawAttribute.slice(0, separator) : rawAttribute).trim().toLowerCase();
    const value = separator >= 0 ? rawAttribute.slice(separator + 1).trim() : '';
    if (key === 'path') {
      cookie.path = value.startsWith('/') ? value : `/${value || ''}`;
    } else if (key === 'expires') {
      const expires = new Date(value);
      if (Number.isNaN(expires.getTime())) {
        throw new Error('Cookie Expires must be a valid date.');
      }
      cookie.expiresAt = expires.toISOString();
    } else if (key === 'max-age') {
      const seconds = Number(value);
      if (!Number.isFinite(seconds)) {
        throw new Error('Cookie Max-Age must be a number.');
      }
      cookie.expiresAt = new Date(Date.now() + (seconds * 1000)).toISOString();
    } else if (key === 'domain') {
      const domain = normalizeCookieManagerDomain(value);
      if (!domain) {
        throw new Error('Cookie Domain must be a hostname.');
      }
      cookie.domain = domain;
      cookie.hostOnly = false;
    } else if (key === 'secure') {
      cookie.secure = true;
    } else if (key === 'httponly') {
      cookie.httpOnly = true;
    } else if (key === 'samesite') {
      cookie.sameSite = normalizeCookieManagerSameSite(value);
      if (!cookie.sameSite) {
        throw new Error('Cookie SameSite must be Lax, Strict, or None.');
      }
    } else if (key === 'priority') {
      cookie.priority = normalizeCookieManagerPriority(value);
    } else if (key === 'partitioned') {
      cookie.partitioned = true;
    } else if (key === 'enabled') {
      cookie.enabled = value.toLowerCase() !== 'false';
    } else {
      cookie.extensions.push(rawAttribute);
    }
  }
  if (!cookie.domain) {
    throw new Error('Cookie domain is required.');
  }
  if (cookie.sameSite === 'None' && cookie.secure !== true) {
    throw new Error('SameSite=None requires Secure.');
  }
  return cookie;
}

function normalizeCookieManagerDomain(value) {
  let text = String(value || '').trim();
  if (!text) {
    return '';
  }
  text = text.replace(/[\u3002\uFF0E\uFF61]/g, '.');
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      text = new URL(text).hostname;
    }
  } catch {
    return '';
  }
  if (text.includes('/') || text.includes('?') || text.includes('#')) {
    text = text.split(/[/?#]/)[0];
  }
  if (text.startsWith('[')) {
    const closing = text.indexOf(']');
    if (closing >= 0) {
      text = text.slice(1, closing);
    }
  } else if (text.includes(':')) {
    text = text.split(':')[0];
  }
  text = text
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase();
  if (!text || /[\s/:]/.test(text)) {
    return '';
  }
  try {
    return new URL(`http://${text}`).hostname.replace(/\.$/, '').toLowerCase();
  } catch {
    return text;
  }
}

function normalizeCookieManagerSameSite(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'none') {
    return 'None';
  }
  return '';
}

function normalizeCookieManagerPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'low') {
    return 'Low';
  }
  if (normalized === 'medium') {
    return 'Medium';
  }
  if (normalized === 'high') {
    return 'High';
  }
  return '';
}

function saveCookieManagerDraft(index, fallbackDomain) {
  const existing = workspace.cookies?.[index];
  if (!existing) {
    resetCookieManagerEditor();
    renderWorkspaceCookieManager();
    return;
  }
  if (cookieManagerCookieIsManaged(existing, cookieManagerManagedCookieNameSet(), domainFromRequestUrl(activeCookieManagerRequestUrl()))) {
    setCookieManagerError('This cookie is managed by Refreshing Auth for this request.');
    return;
  }
  try {
    const parsed = parseSetCookieTextForManager(cookieManagerDraftText, fallbackDomain);
    const next = newWorkspaceCookie({
      ...parsed,
      id: existing.id,
      source: existing.source || ''
    });
    workspace.cookies[index] = next;
    cookieManagerExtraDomains.add(next.domain);
    markCookieJarDirty();
    const savedName = next.name || 'cookie';
    resetCookieManagerEditor();
    renderWorkspaceCookieManager();
    renderCookieJarEditor();
    renderPerformanceCookieJarEditor();
    setStatus(`Saved cookie ${savedName}.`);
  } catch (error) {
    setCookieManagerError(error?.message || String(error));
  }
}

function removeCookieManagerCookie(index) {
  const existing = workspace.cookies?.[index];
  if (!existing) {
    return;
  }
  if (cookieManagerCookieIsManaged(existing, cookieManagerManagedCookieNameSet(), domainFromRequestUrl(activeCookieManagerRequestUrl()))) {
    setCookieManagerError('This cookie is managed by Refreshing Auth for this request.');
    return;
  }
  workspace.cookies.splice(index, 1);
  resetCookieManagerEditor();
  markCookieJarDirty();
  renderWorkspaceCookieManager();
  renderCookieJarEditor();
  renderPerformanceCookieJarEditor();
}

function removeCookieManagerDomain(domain) {
  const normalizedDomain = normalizeCookieManagerDomain(domain);
  if (!normalizedDomain) {
    return;
  }
  workspace.cookies ||= [];
  const before = workspace.cookies.length;
  workspace.cookies = workspace.cookies.filter((cookie) => normalizeCookieManagerDomain(cookie?.domain) !== normalizedDomain);
  cookieManagerExtraDomains.delete(normalizedDomain);
  resetCookieManagerEditor();
  if (workspace.cookies.length !== before) {
    markCookieJarDirty();
  }
  renderWorkspaceCookieManager();
  renderCookieJarEditor();
  renderPerformanceCookieJarEditor();
  const removed = before - workspace.cookies.length;
  setStatus(removed ? `Removed ${removed} cookies from ${normalizedDomain}.` : `Removed domain ${normalizedDomain}.`);
}

function addCookieToDomain(domain) {
  const normalizedDomain = normalizeCookieManagerDomain(domain);
  if (!normalizedDomain) {
    setCookieManagerError('Domain name is required.');
    return;
  }
  workspace.cookies ||= [];
  const cookie = newWorkspaceCookie({
    name: nextCookieNameForDomain(normalizedDomain),
    value: '',
    domain: normalizedDomain,
    path: '/',
    hostOnly: true,
    sameSite: 'Lax'
  });
  workspace.cookies.push(cookie);
  cookieManagerExtraDomains.add(normalizedDomain);
  cookieManagerSelectedCookieIndex = workspace.cookies.length - 1;
  cookieManagerDraftText = cookieToSetCookieText(cookie, normalizedDomain);
  cookieManagerErrorMessage = '';
  markCookieJarDirty();
  renderWorkspaceCookieManager();
  renderCookieJarEditor();
  renderPerformanceCookieJarEditor();
}

function nextCookieNameForDomain(domain) {
  const names = new Set((workspace.cookies || [])
    .filter((cookie) => normalizeCookieManagerDomain(cookie?.domain) === domain)
    .map((cookie) => String(cookie?.name || '')));
  let index = 1;
  while (names.has(`Cookie_${index}`)) {
    index += 1;
  }
  return `Cookie_${index}`;
}

function activeRequestManagedRefreshingCookieNames() {
  const request = activeRequest();
  if (!request) {
    return [];
  }
  if (activeRunnerRequestRunnerId) {
    const runner = (workspace?.runners || []).find((item) => item.id === activeRunnerRequestRunnerId);
    if (runner?.authRefresh?.enabled === true && runnerAuthRefreshIsCookie(runner) && request.useRefreshingAuthCookie === true) {
      return compactCookieNames([authRefreshAccessCookieName(runner.authRefresh)]);
    }
    return [];
  }
  if (activeAuthRefreshRequestOwnerType && activeAuthRefreshRequestOwnerId) {
    const owner = authRefreshOwner(activeAuthRefreshRequestOwnerType, activeAuthRefreshRequestOwnerId);
    const authRefresh = owner?.authRefresh;
    if (authRefresh?.enabled === true
      && String(authRefresh.authType || '').trim() === 'cookie'
      && authRefreshRequestPropertyForId(authRefresh, activeRequestId) === 'request'
      && refreshingAuthRefreshTokenAvailable(authRefresh)) {
      return compactCookieNames([authRefreshRefreshCookieName(authRefresh)]);
    }
  }
  return [];
}

function performanceManagedRefreshingCookieNames(test = activePerformanceTest()) {
  if (!test?.request || !activePerformanceUsesRefreshingAuthCookie(test.authRefresh)) {
    return [];
  }
  return compactCookieNames([authRefreshAccessCookieName(test.authRefresh)]);
}

function authRefreshAccessCookieName(authRefresh = {}) {
  return String(authRefreshOutputForSlot(authRefresh, 'cookie', authRefreshDefaultOutput('cookie')).path || '').trim();
}

function authRefreshRefreshCookieName(authRefresh = {}) {
  const output = authRefreshOutputForSlot(authRefresh, 'refreshToken', authRefreshDefaultOutput('refreshToken'));
  const path = String(output.path || '').trim();
  if (path && path !== AUTH_REFRESH_RAW_BODY_PATH) {
    return path;
  }
  return String(output.variable || authRefresh.refreshTokenVariable || 'refresh_token').trim() || 'refresh_token';
}

function compactCookieNames(names = []) {
  return [...new Set(names.map((name) => String(name || '').trim()).filter(Boolean))];
}
