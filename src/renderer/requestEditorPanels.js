(function attachRequestEditorPanels(global) {
  const {
    applyAssertionTypeDefaults,
    assertionExpectedPlaceholder,
    assertionNamePlaceholder,
    assertionPathPlaceholder
  } = global.PostMeterAssertionModel || require('./assertionModel');
  const { authEditorState, authFromEditorState } = global.PostMeterAuthModel || require('../core/authModel');
  const {
    exampleHeadersToText,
    formatExampleBody,
    parseHeadersText
  } = global.PostMeterExampleModel || require('./exampleModel');
  const {
    cookieFieldIssues,
    domainFromRequestUrl,
    rendererCookieMatchesHost
  } = global.PostMeterCookieModel || require('./cookieModel');

  const DEFAULT_BODY_TYPES = ['NONE', 'RAW_JSON', 'RAW_TEXT'];

  function element(doc, id) {
    return doc.getElementById(id);
  }

  function optionElement(doc, options, id) {
    return element(doc, options.idPrefix ? `${options.idPrefix}${id[0].toUpperCase()}${id.slice(1)}` : id);
  }

  function setOptionElementValue(doc, options, id, value) {
    const target = optionElement(doc, options, id);
    if (target) {
      target.value = value;
    }
  }

  function optionElementValue(doc, options, id) {
    return optionElement(doc, options, id)?.value || '';
  }

  function bodyTypeCodeLanguage(bodyType) {
    return bodyType === 'RAW_JSON' ? 'json' : 'text';
  }

  function refreshVariableTextboxes(root) {
    global.PostMeterVariableHighlighter?.enhanceVariableTextboxes?.(root);
    global.PostMeterVariableHighlighter?.refreshVariableHighlights?.(root);
  }

  function renderExamples(examples, options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId || 'examplesList');
    const exportButton = element(doc, options.exportButtonId || 'exportExamplesButton');
    const bodyTypes = Array.isArray(options.bodyTypes) && options.bodyTypes.length
      ? options.bodyTypes
      : DEFAULT_BODY_TYPES;
    const onDirty = options.onDirty || (() => {});
    const onDuplicate = options.onDuplicate || (() => {});
    const onDelete = options.onDelete || (() => {});

    if (exportButton) {
      exportButton.disabled = !examples.length;
    }
    container.textContent = '';
    if (!examples.length) {
      const empty = doc.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No examples';
      container.append(empty);
      return;
    }

    examples.forEach((example, index) => {
      const item = doc.createElement('section');
      item.className = 'example-item';

      const header = doc.createElement('div');
      header.className = 'example-heading';

      const name = doc.createElement('input');
      name.value = example.name || 'Example Response';
      name.placeholder = 'Example name';
      name.setAttribute('aria-label', `Example ${index + 1} name`);
      name.addEventListener('input', () => {
        example.name = name.value;
        onDirty();
      });

      const status = doc.createElement('input');
      status.type = 'number';
      status.min = '0';
      status.max = '999';
      status.value = example.statusCode || '';
      status.placeholder = 'Status';
      status.setAttribute('aria-label', `Example ${index + 1} status code`);
      status.addEventListener('input', () => {
        example.statusCode = Number(status.value) || 0;
        onDirty();
      });

      const bodyType = doc.createElement('select');
      for (const type of bodyTypes) {
        bodyType.append(new Option(type, type));
      }
      bodyType.value = bodyTypes.includes(example.bodyType) ? example.bodyType : 'RAW_TEXT';
      bodyType.setAttribute('aria-label', `Example ${index + 1} body type`);

      const body = doc.createElement('textarea');
      body.spellcheck = false;
      body.value = formatExampleBody(example);
      body.dataset.codeEditor = 'true';
      body.dataset.codeLanguage = bodyTypeCodeLanguage(bodyType.value);
      body.setAttribute('aria-label', `Example ${index + 1} body`);
      body.addEventListener('input', () => {
        example.body = body.value;
        onDirty();
      });

      bodyType.addEventListener('change', () => {
        example.bodyType = bodyType.value;
        body.value = formatExampleBody(example);
        global.PostMeterCodeEditor?.setLanguage?.(body, bodyTypeCodeLanguage(bodyType.value));
        onDirty();
      });

      const duplicate = doc.createElement('button');
      duplicate.textContent = 'Duplicate';
      duplicate.setAttribute('aria-label', `Duplicate example ${example.name || index + 1}`);
      duplicate.addEventListener('click', () => onDuplicate(index));

      const remove = doc.createElement('button');
      remove.className = 'danger';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete example ${example.name || index + 1}`);
      remove.addEventListener('click', () => onDelete(index));

      header.append(name, status, bodyType, duplicate, remove);

      const headers = doc.createElement('textarea');
      headers.spellcheck = false;
      headers.value = exampleHeadersToText(example.headers || []);
      headers.placeholder = 'Header-Name: value';
      headers.dataset.codeEditor = 'true';
      headers.dataset.codeLanguage = 'headers';
      headers.setAttribute('aria-label', `Example ${index + 1} headers`);
      headers.addEventListener('input', () => {
        example.headers = parseHeadersText(headers.value);
        onDirty();
      });

      item.append(header, headers, body);
      container.append(item);
      global.PostMeterCodeEditor?.enhanceCodeTextareas?.(item);
    });
    refreshVariableTextboxes(container);
  }

  function renderAuthEditor(auth, options = {}) {
    const doc = options.doc || document;
    const showAuthSection = options.showAuthSection || (() => {});
    const fields = authEditorState(auth);

    setOptionElementValue(doc, options, 'authTypeSelect', fields.type);
    showAuthSection(fields.type);
    setOptionElementValue(doc, options, 'authBearerTokenInput', fields.bearerToken);
    setOptionElementValue(doc, options, 'authBasicUsernameInput', fields.basicUsername);
    setOptionElementValue(doc, options, 'authBasicPasswordInput', fields.basicPassword);
    setOptionElementValue(doc, options, 'authApiKeyLocationSelect', fields.apiKeyLocation);
    setOptionElementValue(doc, options, 'authApiKeyNameInput', fields.apiKeyName);
    setOptionElementValue(doc, options, 'authApiKeyValueInput', fields.apiKeyValue);
    setOptionElementValue(doc, options, 'authCookieValueInput', fields.cookieValue);
    setOptionElementValue(doc, options, 'authOauthGrantTypeSelect', fields.oauthGrantType);
    setOptionElementValue(doc, options, 'authOauthTokenTypeSelect', fields.oauthTokenType);
    setOptionElementValue(doc, options, 'authOauthAccessTokenInput', fields.oauthAccessToken);
    setOptionElementValue(doc, options, 'authOauthRefreshTokenInput', fields.oauthRefreshToken);
    setOptionElementValue(doc, options, 'authOauthAuthorizationUrlInput', fields.oauthAuthorizationUrl);
    setOptionElementValue(doc, options, 'authOauthRedirectStrategySelect', fields.oauthRedirectStrategy);
    setOptionElementValue(doc, options, 'authOauthDeviceAuthorizationUrlInput', fields.oauthDeviceAuthorizationUrl);
    setOptionElementValue(doc, options, 'authOauthTokenUrlInput', fields.oauthTokenUrl);
    setOptionElementValue(doc, options, 'authOauthClientIdInput', fields.oauthClientId);
    setOptionElementValue(doc, options, 'authOauthClientSecretInput', fields.oauthClientSecret);
    setOptionElementValue(doc, options, 'authOauthScopesInput', fields.oauthScopes);
    setOptionElementValue(doc, options, 'authOauthUserCodeInput', fields.oauthUserCode);
    setOptionElementValue(doc, options, 'authOauthVerificationUriInput', fields.oauthVerificationUri);
    setOptionElementValue(doc, options, 'authClientPfxPathInput', fields.clientPfxPath);
    setOptionElementValue(doc, options, 'authClientCertPathInput', fields.clientCertPath);
    setOptionElementValue(doc, options, 'authClientKeyPathInput', fields.clientKeyPath);
    setOptionElementValue(doc, options, 'authClientCaPathInput', fields.clientCaPath);
    setOptionElementValue(doc, options, 'authClientPassphraseInput', fields.clientPassphrase);
  }

  function collectAuthFromEditor(options = {}) {
    const doc = options.doc || document;
    return authFromEditorState({
      type: optionElementValue(doc, options, 'authTypeSelect'),
      bearerToken: optionElementValue(doc, options, 'authBearerTokenInput'),
      basicUsername: optionElementValue(doc, options, 'authBasicUsernameInput'),
      basicPassword: optionElementValue(doc, options, 'authBasicPasswordInput'),
      apiKeyLocation: optionElementValue(doc, options, 'authApiKeyLocationSelect'),
      apiKeyName: optionElementValue(doc, options, 'authApiKeyNameInput'),
      apiKeyValue: optionElementValue(doc, options, 'authApiKeyValueInput'),
      cookieValue: optionElementValue(doc, options, 'authCookieValueInput'),
      oauthGrantType: optionElementValue(doc, options, 'authOauthGrantTypeSelect'),
      oauthTokenType: optionElementValue(doc, options, 'authOauthTokenTypeSelect'),
      oauthAccessToken: optionElementValue(doc, options, 'authOauthAccessTokenInput'),
      oauthRefreshToken: optionElementValue(doc, options, 'authOauthRefreshTokenInput'),
      oauthAuthorizationUrl: optionElementValue(doc, options, 'authOauthAuthorizationUrlInput'),
      oauthRedirectStrategy: optionElementValue(doc, options, 'authOauthRedirectStrategySelect'),
      oauthDeviceAuthorizationUrl: optionElementValue(doc, options, 'authOauthDeviceAuthorizationUrlInput'),
      oauthTokenUrl: optionElementValue(doc, options, 'authOauthTokenUrlInput'),
      oauthClientId: optionElementValue(doc, options, 'authOauthClientIdInput'),
      oauthClientSecret: optionElementValue(doc, options, 'authOauthClientSecretInput'),
      oauthScopes: optionElementValue(doc, options, 'authOauthScopesInput'),
      oauthUserCode: optionElementValue(doc, options, 'authOauthUserCodeInput'),
      clientPfxPath: optionElementValue(doc, options, 'authClientPfxPathInput'),
      clientCertPath: optionElementValue(doc, options, 'authClientCertPathInput'),
      clientKeyPath: optionElementValue(doc, options, 'authClientKeyPathInput'),
      clientCaPath: optionElementValue(doc, options, 'authClientCaPathInput'),
      clientPassphrase: optionElementValue(doc, options, 'authClientPassphraseInput')
    }, options.existingAuth || {});
  }

  function renderVariablePairs(options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId);
    const pairs = options.pairs || [];
    const onChange = options.onChange || (() => {});
    const onRemove = options.onRemove || (() => {});
    const rowClassName = options.rowClassName || 'kv-row env-row';
    const keyPlaceholder = options.keyPlaceholder || 'Variable';
    const valuePlaceholder = options.valuePlaceholder || 'Value';

    container.textContent = '';
    pairs.forEach((pair, index) => {
      const row = doc.createElement('div');
      row.className = rowClassName;

      const enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = pair.enabled !== false;
      enabled.setAttribute('aria-label', `${keyPlaceholder} ${index + 1} enabled`);
      enabled.addEventListener('change', () => {
        pair.enabled = enabled.checked;
        onChange(index, pair);
      });

      const key = doc.createElement('input');
      key.placeholder = keyPlaceholder;
      key.setAttribute('aria-label', `${keyPlaceholder} ${index + 1}`);
      key.value = pair.key || '';
      key.addEventListener('input', () => {
        pair.key = key.value;
        onChange(index, pair);
      });

      const value = doc.createElement('input');
      value.placeholder = valuePlaceholder;
      value.type = 'text';
      value.setAttribute('aria-label', `${valuePlaceholder} ${index + 1}`);
      value.value = pair.value || '';
      value.addEventListener('input', () => {
        pair.value = value.value;
        onChange(index, pair);
      });

      const remove = doc.createElement('button');
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${keyPlaceholder.toLowerCase()} ${pair.key || index + 1}`);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1);
        onRemove(index);
      });

      row.append(enabled, key, value, remove);
      container.append(row);
    });
    refreshVariableTextboxes(container);
  }

  function renderRequestPairs(options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId);
    const pairs = options.pairs || [];
    const onDirty = options.onDirty || (() => {});
    const onRemove = options.onRemove || (() => {});
    const keyPlaceholder = options.keyPlaceholder || 'Key';
    const valuePlaceholder = options.valuePlaceholder || 'Value';

    container.textContent = '';
    pairs.forEach((pair, index) => {
      const row = doc.createElement('div');
      row.className = 'kv-row';

      const enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = pair.enabled !== false;
      enabled.setAttribute('aria-label', `${keyPlaceholder} ${index + 1} enabled`);
      enabled.addEventListener('change', () => {
        pair.enabled = enabled.checked;
        onDirty();
      });

      const key = doc.createElement('input');
      key.placeholder = keyPlaceholder;
      key.setAttribute('aria-label', `${keyPlaceholder} ${index + 1}`);
      key.value = pair.key || '';
      key.addEventListener('input', () => {
        pair.key = key.value;
        onDirty();
      });

      const value = doc.createElement('input');
      value.placeholder = valuePlaceholder;
      value.setAttribute('aria-label', `${valuePlaceholder} ${index + 1}`);
      value.value = pair.value || '';
      value.addEventListener('input', () => {
        pair.value = value.value;
        onDirty();
      });

      const remove = doc.createElement('button');
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${keyPlaceholder.toLowerCase()} ${pair.key || index + 1}`);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1);
        row.parentNode?.removeChild(row);
        onDirty();
        onRemove(index);
      });

      row.append(enabled, key, value, remove);
      container.append(row);
    });
    refreshVariableTextboxes(container);
  }

  function renderAssertions(options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId || 'assertionsTable');
    const assertions = options.assertions || [];
    const onDirty = options.onDirty || (() => {});
    const onRerender = options.onRerender || (() => {});

    container.textContent = '';
    assertions.forEach((assertion, index) => {
      const row = doc.createElement('div');
      row.className = 'assertion-row';
      row.dataset.assertionType = assertion.type || 'statusCode';

      const enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = assertion.enabled !== false;
      enabled.setAttribute('aria-label', `Assertion ${index + 1} enabled`);
      enabled.addEventListener('change', () => {
        assertion.enabled = enabled.checked;
        onDirty();
      });

      const type = doc.createElement('select');
      for (const [value, label] of [
        ['statusCode', 'Status'],
        ['header', 'Header'],
        ['jsonPath', 'JSON Path'],
        ['xmlPath', 'XML XPath'],
        ['htmlSelector', 'HTML Selector'],
        ['responseTime', 'Time'],
        ['responseSize', 'Size'],
        ['bodyContains', 'Body Contains'],
        ['extractVariable', 'Extract JSON'],
        ['extractXml', 'Extract XML'],
        ['extractHtml', 'Extract HTML'],
        ['extractRegex', 'Extract Regex']
      ]) {
        type.append(new Option(label, value));
      }
      type.value = assertion.type || 'statusCode';
      type.setAttribute('aria-label', `Assertion ${index + 1} type`);
      type.addEventListener('change', () => {
        assertion.type = type.value;
        applyAssertionTypeDefaults(assertion);
        onDirty();
        onRerender();
      });

      const name = assertionInput(doc, assertionNamePlaceholder(assertion), assertion.name || assertion.variableName || '', (value) => {
        assertion.name = value;
        if (assertion.type === 'extractVariable' || assertion.type === 'extractXml' || assertion.type === 'extractHtml' || assertion.type === 'extractRegex') {
          assertion.variableName = value;
        }
      }, onDirty, `Assertion ${index + 1} name`);
      const path = assertionInput(doc, assertionPathPlaceholder(assertion), assertion.path || '', (value) => {
        assertion.path = value;
      }, onDirty, `Assertion ${index + 1} path`);

      const operator = doc.createElement('select');
      for (const [value, label] of [
        ['equals', '='],
        ['notEquals', '!='],
        ['contains', 'contains'],
        ['exists', 'exists'],
        ['lessThan', '<'],
        ['greaterThan', '>']
      ]) {
        operator.append(new Option(label, value));
      }
      operator.value = assertion.operator || 'equals';
      operator.setAttribute('aria-label', `Assertion ${index + 1} operator`);
      operator.addEventListener('change', () => {
        assertion.operator = operator.value;
        onDirty();
      });

      const expected = assertionInput(doc, assertionExpectedPlaceholder(assertion), assertion.expected ?? '', (value) => {
        assertion.expected = value;
      }, onDirty, `Assertion ${index + 1} expected value`);

      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove assertion ${assertion.name || index + 1}`);
      remove.addEventListener('click', () => {
        assertions.splice(index, 1);
        onDirty();
        onRerender();
      });

      row.append(enabled, type, name, path, operator, expected, remove);
      container.append(row);
    });
    refreshVariableTextboxes(container);
  }

  function assertionInput(doc, placeholder, value, onInput, onDirty, ariaLabel = placeholder) {
    const input = doc.createElement('input');
    input.placeholder = placeholder;
    input.setAttribute('aria-label', ariaLabel);
    input.value = value;
    input.addEventListener('input', () => {
      onInput(input.value);
      onDirty();
    });
    return input;
  }

  function buildVariablePreviewText(collection, environment, request) {
    const rows = [];
    const effective = new Map();

    for (const pair of collection?.variables || []) {
      if (pair.enabled === false || !pair.key) {
        continue;
      }
      effective.set(pair.key, {
        key: pair.key,
        value: pair.value ?? '',
        source: 'Collection'
      });
    }
    for (const pair of environment?.variables || []) {
      if (pair.enabled === false || !pair.key) {
        continue;
      }
      effective.set(pair.key, {
        key: pair.key,
        value: pair.value ?? '',
        source: 'Environment'
      });
    }
    for (const pair of request?.variables || []) {
      if (pair.enabled === false || !pair.key) {
        continue;
      }
      effective.set(pair.key, {
        key: pair.key,
        value: pair.value ?? '',
        source: 'Request'
      });
    }

    for (const item of [...effective.values()].sort((left, right) => left.key.localeCompare(right.key))) {
      rows.push(`${item.key} = ${item.value} (${item.source})`);
    }
    return rows.length ? rows.join('\n') : 'No variables';
  }

  function renderVariablePreview(options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId || 'variablePreview');
    container.textContent = buildVariablePreviewText(options.collection, options.environment, options.request);
  }

  function renderCookieJarEditor(options = {}) {
    const doc = options.doc || document;
    const onDirty = options.onDirty || (() => {});
    const workspace = options.workspace;
    const rerender = options.rerender || (() => {});
    const setStatus = options.setStatus || (() => {});
    const container = element(doc, options.containerId || 'cookiesTable');
    const filterInput = element(doc, options.filterInputId || 'filterCookiesToRequestHostInput');
    const filterLabel = element(doc, options.filterLabelId || 'cookieHostFilterLabel');

    workspace.cookies ||= [];
    container.textContent = '';

    const activeHost = domainFromRequestUrl(options.activeRequestUrl);
    const filterActive = filterInput?.checked === true && Boolean(activeHost);
    if (filterInput) {
      filterInput.disabled = !activeHost;
      if (!activeHost) {
        filterInput.checked = false;
      }
    }
    if (filterLabel) {
      filterLabel.textContent = activeHost ? `Host: ${activeHost}` : 'No active host';
    }

    const visibleCookies = workspace.cookies
      .map((cookie, index) => ({ cookie, index }))
      .filter(({ cookie }) => !filterActive || rendererCookieMatchesHost(cookie, activeHost));

    if (!visibleCookies.length) {
      const empty = doc.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = workspace.cookies.length && filterActive ? 'No cookies for active host' : 'No cookies';
      container.append(empty);
      return;
    }

    visibleCookies.forEach(({ cookie, index }) => {
      const row = doc.createElement('div');
      row.className = 'cookie-row';

      const enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = cookie.enabled !== false;
      enabled.setAttribute('aria-label', `Cookie ${cookie.name || index + 1} enabled`);
      enabled.addEventListener('change', () => {
        onDirty();
        cookie.enabled = enabled.checked;
      });

      const cookieLabel = cookie.name || index + 1;
      const name = cookieInput(doc, cookie.name || '', 'Name', (value) => {
        onDirty();
        cookie.name = value;
      }, 'text', `Cookie ${cookieLabel} name`);
      const value = cookieInput(doc, cookie.value || '', 'Value', (next) => {
        onDirty();
        cookie.value = next;
      }, 'text', `Cookie ${cookieLabel} value`);
      const domain = cookieInput(doc, cookie.domain || '', 'Domain', (next) => {
        onDirty();
        cookie.domain = next;
      }, 'text', `Cookie ${cookieLabel} domain`);
      const path = cookieInput(doc, cookie.path || '/', 'Path', (next) => {
        onDirty();
        cookie.path = next || '/';
      }, 'text', `Cookie ${cookieLabel} path`);
      const expires = cookieInput(doc, cookie.expiresAt || '', 'Expires ISO', (next) => {
        onDirty();
        cookie.expiresAt = next;
      }, 'text', `Cookie ${cookieLabel} expiration`);

      const secureLabel = checkboxLabel(doc, 'Secure', cookie.secure === true, (checked) => {
        onDirty();
        cookie.secure = checked;
        if (!checked && cookie.sameSite === 'None') {
          cookie.sameSite = '';
          setStatus('SameSite=None requires Secure.');
          rerender();
        }
      });
      const httpOnlyLabel = checkboxLabel(doc, 'HttpOnly', cookie.httpOnly === true, (checked) => {
        onDirty();
        cookie.httpOnly = checked;
      });
      const hostOnlyLabel = checkboxLabel(doc, 'Host only', cookie.hostOnly !== false, (checked) => {
        onDirty();
        cookie.hostOnly = checked;
        rerender();
      });

      const sameSite = doc.createElement('select');
      for (const option of ['', 'Lax', 'Strict', 'None']) {
        sameSite.append(new Option(option || 'SameSite', option));
      }
      sameSite.value = cookie.sameSite || '';
      sameSite.setAttribute('aria-label', `Cookie ${cookie.name || index + 1} SameSite`);
      sameSite.addEventListener('change', () => {
        if (sameSite.value === 'None' && cookie.secure !== true) {
          cookie.sameSite = '';
          sameSite.value = '';
          setStatus('SameSite=None requires Secure.');
          return;
        }
        onDirty();
        cookie.sameSite = sameSite.value;
      });

      const remove = doc.createElement('button');
      remove.className = 'danger';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove cookie ${cookie.name || index + 1}`);
      remove.addEventListener('click', () => {
        onDirty();
        workspace.cookies.splice(index, 1);
        rerender();
      });

      bindCookieFieldValidation(cookie, { domain, path, expires }, activeHost);
      row.append(enabled, name, value, domain, path, expires, secureLabel, httpOnlyLabel, hostOnlyLabel, sameSite, remove);
      container.append(row);
    });
    refreshVariableTextboxes(container);
  }

  function cookieInput(doc, initialValue, placeholder, onInput, type = 'text', ariaLabel = `Cookie ${placeholder}`) {
    const input = doc.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', ariaLabel);
    input.value = initialValue;
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function bindCookieFieldValidation(cookie, inputs, activeHost) {
    const refresh = () => {
      const issues = cookieFieldIssues(cookie, activeHost);
      applyCookieInputIssue(inputs.domain, issues.domain);
      applyCookieInputIssue(inputs.path, issues.path);
      applyCookieInputIssue(inputs.expires, issues.expires);
    };
    for (const input of Object.values(inputs)) {
      input.addEventListener('input', refresh);
    }
    refresh();
  }

  function applyCookieInputIssue(input, issue) {
    input.classList.toggle('invalid-input', Boolean(issue));
    input.setAttribute('aria-invalid', issue ? 'true' : 'false');
    input.title = issue || '';
  }

  function checkboxLabel(doc, label, checked, onChange) {
    const wrapper = doc.createElement('label');
    wrapper.className = 'inline-toggle';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => onChange(input.checked));
    const text = doc.createElement('span');
    text.textContent = label;
    wrapper.append(input, text);
    return wrapper;
  }

  const exported = {
    bodyTypeCodeLanguage,
    buildVariablePreviewText,
    collectAuthFromEditor,
    renderAuthEditor,
    renderAssertions,
    renderCookieJarEditor,
    renderExamples,
    renderRequestPairs,
    renderVariablePairs,
    renderVariablePreview
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRequestEditorPanels = exported;
})(typeof window === 'undefined' ? globalThis : window);
