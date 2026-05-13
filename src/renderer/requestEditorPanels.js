(function attachRequestEditorPanels(global) {
  const { authEditorState, authFromEditorState } = global.PostMeterAuthModel || require('../core/authModel');
  const {
    cookieFieldIssues,
    domainFromRequestUrl,
    rendererCookieMatchesHost
  } = global.PostMeterCookieModel || require('./cookieModel');

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
      remove.className = 'danger-button';
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
      remove.className = 'danger-button';
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

  function buildVariablePreviewText(collection, environment, request, folder, folders = null) {
    const rows = [];
    const effective = new Map();

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
    const folderScopes = Array.isArray(folders) ? folders : (folder ? [folder] : []);
    for (const folderScope of folderScopes) {
      for (const pair of folderScope?.variables || []) {
        if (pair.enabled === false || !pair.key) {
          continue;
        }
        effective.set(pair.key, {
          key: pair.key,
          value: pair.value ?? '',
          source: 'Folder'
        });
      }
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
    container.textContent = buildVariablePreviewText(options.collection, options.environment, options.request, options.folder, options.folders);
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
      remove.className = 'danger-button';
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
    renderCookieJarEditor,
    renderRequestPairs,
    renderVariablePairs,
    renderVariablePreview
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRequestEditorPanels = exported;
})(typeof window === 'undefined' ? globalThis : window);
