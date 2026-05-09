(function attachVariableHighlighter(global) {
  const HIGHLIGHT_STATE = new WeakMap();
  const VARIABLE_NAME_PATTERN = /^[$A-Za-z0-9_.-]+$/;
  const VARIABLE_TOKEN_PATTERN = /\{\{\s*([^{}\r\n]+?)\s*\}\}/g;
  const TEXT_INPUT_TYPES = new Set(['', 'email', 'search', 'tel', 'text', 'url']);
  let configuredGetVariables = () => [];

  function highlightVariableTokens(value, options = {}) {
    const text = String(value || '');
    const renderText = typeof options.renderText === 'function'
      ? options.renderText
      : escapeHtml;
    const tokenClassName = options.tokenClassName || 'variable-highlight-token';
    const statusClassPrefix = options.statusClassPrefix || 'variable-highlight-';
    let html = '';
    let lastIndex = 0;
    VARIABLE_TOKEN_PATTERN.lastIndex = 0;
    for (let match = VARIABLE_TOKEN_PATTERN.exec(text); match; match = VARIABLE_TOKEN_PATTERN.exec(text)) {
      const token = match[0];
      const name = String(match[1] || '').trim();
      if (!name) {
        continue;
      }
      html += renderText(text.slice(lastIndex, match.index));
      const status = variableTokenStatus(name, options);
      html += `<span class="${escapeAttribute(`${tokenClassName} ${statusClassPrefix}${status}`)}" data-variable-name="${escapeAttribute(name)}" data-variable-status="${status}">${escapeHtml(token)}</span>`;
      lastIndex = match.index + token.length;
    }
    html += renderText(text.slice(lastIndex));
    return html || '<br>';
  }

  function enhanceVariableTextboxes(root = global.document) {
    const textboxes = variableTextboxesFromRoot(root);
    for (const textbox of textboxes) {
      enhanceTextbox(textbox);
    }
    return textboxes.length;
  }

  function refreshVariableHighlights(root = global.document) {
    const textboxes = variableTextboxesFromRoot(root);
    for (const textbox of textboxes) {
      refreshTextbox(textbox);
    }
    return textboxes.length;
  }

  function install(root = global.document, options = {}) {
    const doc = root.nodeType === 9 ? root : root.ownerDocument || global.document;
    const windowObject = options.windowObject || doc?.defaultView || global;
    if (!doc) {
      return { destroy() {} };
    }
    if (typeof options.getVariables === 'function') {
      setVariableSource(options.getVariables);
    }
    enhanceVariableTextboxes(doc);
    const observer = typeof windowObject.MutationObserver === 'function'
      ? new windowObject.MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes || []) {
            enhanceVariableTextboxes(node);
          }
        }
      })
      : null;
    observer?.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    const onResize = () => refreshVariableHighlights(doc);
    windowObject.addEventListener?.('resize', onResize);
    return {
      destroy() {
        observer?.disconnect();
        windowObject.removeEventListener?.('resize', onResize);
      }
    };
  }

  function enhanceTextbox(textbox) {
    if (!isHighlightableTextbox(textbox)) {
      return null;
    }
    const existing = HIGHLIGHT_STATE.get(textbox);
    if (existing) {
      refreshTextbox(textbox);
      return existing;
    }
    const doc = textbox.ownerDocument || global.document;
    const wrapper = doc.createElement('span');
    wrapper.className = `variable-highlight-editor ${isTextarea(textbox) ? 'is-textarea' : 'is-input'}`;
    wrapper.hidden = textbox.hidden === true;
    const overlay = doc.createElement('span');
    overlay.className = 'variable-highlight-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const code = doc.createElement('span');
    code.className = 'variable-highlight-code';
    overlay.append(code);

    const parent = textbox.parentNode;
    if (parent) {
      parent.insertBefore(wrapper, textbox);
      wrapper.append(overlay, textbox);
    }
    textbox.classList.add('variable-highlight-input');

    const state = {
      code,
      onInput: () => refreshTextbox(textbox),
      onScroll: () => syncScroll(textbox),
      overlay,
      wrapper
    };
    textbox.addEventListener('input', state.onInput);
    textbox.addEventListener('change', state.onInput);
    textbox.addEventListener('scroll', state.onScroll);
    HIGHLIGHT_STATE.set(textbox, state);
    refreshTextbox(textbox);
    return state;
  }

  function refreshTextbox(textbox) {
    const state = HIGHLIGHT_STATE.get(textbox);
    if (!state) {
      return false;
    }
    const hasValue = String(textbox.value || '').length > 0;
    state.wrapper.hidden = textbox.hidden === true;
    state.wrapper.classList.toggle('has-variable-highlight-value', hasValue);
    textbox.classList.toggle('has-variable-highlight-value', hasValue);
    state.code.innerHTML = highlightVariableTokens(textbox.value || '', { target: textbox });
    copyTextboxMetrics(textbox, state.overlay);
    syncScroll(textbox);
    return true;
  }

  function setVariableSource(getVariables) {
    configuredGetVariables = typeof getVariables === 'function' ? getVariables : () => [];
  }

  function variableTokenStatus(name, options = {}) {
    if (!VARIABLE_NAME_PATTERN.test(String(name || ''))) {
      return 'invalid';
    }
    const isKnownVariable = typeof options.isKnownVariable === 'function'
      ? options.isKnownVariable
      : null;
    if (isKnownVariable) {
      return isKnownVariable(name, options.target) ? 'valid' : 'invalid';
    }
    return variableNameSet(options, options.target).has(name) ? 'valid' : 'invalid';
  }

  function variableNameSet(options = {}, target = null) {
    if (options.variableNames instanceof Set) {
      return options.variableNames;
    }
    if (Array.isArray(options.variableNames)) {
      return new Set(options.variableNames.map((name) => String(name || '').trim()).filter(Boolean));
    }
    return new Set(normalizeVariables(options.variables || configuredVariablesForTarget(target)).map((variable) => variable.key));
  }

  function configuredVariablesForTarget(target) {
    try {
      return configuredGetVariables(target) || [];
    } catch {
      return [];
    }
  }

  function normalizeVariables(variables) {
    const normalized = [];
    for (const variable of variables || []) {
      if (!variable || variable.enabled === false) {
        continue;
      }
      const key = String(variable.key || '').trim();
      if (key) {
        normalized.push({ key });
      }
    }
    return normalized;
  }

  function syncScroll(textbox) {
    const state = HIGHLIGHT_STATE.get(textbox);
    if (!state) {
      return;
    }
    state.code.style.transform = `translate(${-textbox.scrollLeft}px, ${-textbox.scrollTop}px)`;
  }

  function variableTextboxesFromRoot(root) {
    if (!root) {
      return [];
    }
    const textboxes = [];
    if (isHighlightableTextbox(root)) {
      textboxes.push(root);
    }
    if (typeof root.querySelectorAll === 'function') {
      textboxes.push(...root.querySelectorAll('input, textarea'));
    }
    return [...new Set(textboxes)].filter(isHighlightableTextbox);
  }

  function isHighlightableTextbox(element) {
    if (element?.getAttribute?.('data-variable-highlight') === 'false') {
      return false;
    }
    if (!element || element.classList?.contains('code-editor-input')) {
      return false;
    }
    if (HIGHLIGHT_STATE.has(element)) {
      return true;
    }
    if (element.closest?.('.code-editor') || element.closest?.('.variable-highlight-editor')) {
      return false;
    }
    if (isTextarea(element)) {
      return element.getAttribute?.('data-code-editor') == null;
    }
    if (!isInput(element)) {
      return false;
    }
    return TEXT_INPUT_TYPES.has(String(element.getAttribute('type') || element.type || '').toLowerCase());
  }

  function isInput(element) {
    return String(element?.tagName || '').toUpperCase() === 'INPUT';
  }

  function isTextarea(element) {
    return String(element?.tagName || '').toUpperCase() === 'TEXTAREA';
  }

  function copyTextboxMetrics(textbox, overlay) {
    const view = textbox.ownerDocument?.defaultView || global;
    if (typeof view.getComputedStyle !== 'function') {
      return;
    }
    const style = view.getComputedStyle(textbox);
    for (const property of [
      'borderBottomWidth',
      'borderLeftWidth',
      'borderRightWidth',
      'borderTopWidth',
      'boxSizing',
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'paddingBottom',
      'paddingLeft',
      'paddingRight',
      'paddingTop',
      'tabSize',
      'textAlign',
      'textIndent',
      'textTransform',
      'wordSpacing'
    ]) {
      overlay.style[property] = style[property];
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }

  const exported = {
    enhanceVariableTextboxes,
    highlightVariableTokens,
    install,
    refreshVariableHighlights,
    setVariableSource
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterVariableHighlighter = exported;
})(typeof window === 'undefined' ? globalThis : window);
