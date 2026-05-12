(function attachVariableHighlighter(global) {
  const HIGHLIGHT_STATE = new WeakMap();
  const TEXT_MEASURE_SPANS = new WeakMap();
  const VARIABLE_NAME_PATTERN = /^[$A-Za-z0-9_.-]+$/;
  const VARIABLE_TOKEN_PATTERN = /\{\{\s*([^{}\r\n]+?)\s*\}\}|\$\{\s*([^{}\r\n]+?)\s*\}/g;
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
      const name = String(match[1] || match[2] || '').trim();
      const source = match[2] == null ? variableTokenSource(name, options) : 'csv';
      if (!name) {
        continue;
      }
      html += renderText(text.slice(lastIndex, match.index));
      const status = variableTokenStatus(name, { ...options, source });
      const classes = [
        tokenClassName,
        `${statusClassPrefix}${status}`,
        `${statusClassPrefix}${source}`
      ].filter(Boolean).join(' ');
      html += `<span class="${escapeAttribute(classes)}" data-variable-name="${escapeAttribute(name)}" data-variable-status="${status}" data-variable-source="${source}">${escapeHtml(token)}</span>`;
      lastIndex = match.index + token.length;
    }
    html += renderText(text.slice(lastIndex));
    return html || '<br>';
  }

  function variableTokenSource(name, options = {}) {
    if (!VARIABLE_NAME_PATTERN.test(String(name || ''))) {
      return 'environment';
    }
    const variable = normalizedVariablesForOptions(options, options.target)
      .filter((item) => variableMatchesPostmanToken(item))
      .find((item) => item.key === name);
    return variable?.source || 'environment';
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
      onMouseDown: (event) => normalizeSingleLineCaret(textbox, event),
      onScroll: () => syncScroll(textbox),
      overlay,
      wrapper
    };
    textbox.addEventListener('input', state.onInput);
    textbox.addEventListener('change', state.onInput);
    if (isInput(textbox)) {
      textbox.addEventListener('mousedown', state.onMouseDown);
    }
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
      return isKnownVariable(name, options.target, options.source) ? 'valid' : 'invalid';
    }
    return variableNameSet(options, options.target, options.source).has(name) ? 'valid' : 'invalid';
  }

  function variableNameSet(options = {}, target = null, source = '') {
    if (options.variableNames instanceof Set) {
      return options.variableNames;
    }
    if (Array.isArray(options.variableNames)) {
      return new Set(options.variableNames.map((name) => String(name || '').trim()).filter(Boolean));
    }
    return new Set(
      normalizedVariablesForOptions(options, target)
        .filter((variable) => variableMatchesSource(variable, source))
        .map((variable) => variable.key)
    );
  }

  function normalizedVariablesForOptions(options = {}, target = null) {
    return normalizeVariables(options.variables || configuredVariablesForTarget(target));
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
        normalized.push({
          key,
          source: normalizeVariableSource(variable.source || variable.kind || variable.scope || variable.type)
        });
      }
    }
    return normalized;
  }

  function normalizeVariableSource(source) {
    const normalized = String(source || '').trim().toLowerCase();
    if (normalized === 'csv' || normalized === 'iteration' || normalized === 'iterationdata') {
      return 'csv';
    }
    if (normalized === 'environment' || normalized === 'env') {
      return 'environment';
    }
    if (normalized === 'collection' || normalized === 'collectionvariable' || normalized === 'collectionvariables') {
      return 'collection';
    }
    if (normalized === 'request' || normalized === 'local' || normalized === 'variable' || normalized === 'variables') {
      return 'request';
    }
    if (normalized === 'global' || normalized === 'globals') {
      return 'global';
    }
    return normalized;
  }

  function variableMatchesPostmanToken(variable) {
    const source = normalizeVariableSource(variable?.source);
    return !source || source === 'environment' || source === 'collection' || source === 'request' || source === 'global';
  }

  function variableMatchesSource(variable, source) {
    const expected = normalizeVariableSource(source);
    if (!expected) {
      return true;
    }
    if (!variable.source) {
      return true;
    }
    return variable.source === expected;
  }

  function syncScroll(textbox) {
    const state = HIGHLIGHT_STATE.get(textbox);
    if (!state) {
      return;
    }
    state.code.style.transform = `translate(${-textbox.scrollLeft}px, ${-textbox.scrollTop}px)`;
  }

  function normalizeSingleLineCaret(textbox, event) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.detail > 1
      || event.shiftKey
      || event.ctrlKey
      || event.altKey
      || event.metaKey
      || textbox.disabled
      || textbox.readOnly
      || isTextarea(textbox)
      || clickIsInsideTextBand(textbox, event.clientY)
    ) {
      return;
    }

    event.preventDefault();
    focusWithoutScrolling(textbox);
    const index = caretIndexFromClientX(textbox, event.clientX);
    try {
      if (typeof textbox.setSelectionRange === 'function') {
        textbox.setSelectionRange(index, index);
        return;
      }
      textbox.selectionStart = index;
      textbox.selectionEnd = index;
    } catch {
      // Some input types expose selection APIs but reject direct range updates.
    }
  }

  function clickIsInsideTextBand(textbox, clientY) {
    const rect = textbox.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.height) || rect.height <= 0 || !Number.isFinite(clientY)) {
      return true;
    }
    const style = computedStyle(textbox);
    if (!style) {
      return true;
    }
    const textTop = rect.top + cssPixels(style.borderTopWidth) + cssPixels(style.paddingTop);
    const textBottom = textTop + computedLineHeight(style);
    return clientY >= textTop - 1 && clientY <= textBottom + 1;
  }

  function caretIndexFromClientX(textbox, clientX) {
    const value = String(textbox.value || '');
    if (!value || !Number.isFinite(clientX)) {
      return 0;
    }
    const rect = textbox.getBoundingClientRect?.();
    const style = computedStyle(textbox);
    if (!rect || !style) {
      return value.length;
    }
    const borderLeft = cssPixels(style.borderLeftWidth);
    const borderRight = cssPixels(style.borderRightWidth);
    const paddingLeft = cssPixels(style.paddingLeft);
    const paddingRight = cssPixels(style.paddingRight);
    const availableWidth = Math.max(0, rect.width - borderLeft - borderRight - paddingLeft - paddingRight);
    const fullWidth = measureSingleLineText(textbox, value, style);
    let contentLeft = rect.left + borderLeft + paddingLeft;
    const align = String(style.textAlign || '').toLowerCase();
    if (align === 'center') {
      contentLeft += Math.max(0, (availableWidth - fullWidth) / 2);
    } else if (align === 'right' || align === 'end') {
      contentLeft += Math.max(0, availableWidth - fullWidth);
    }

    const offset = clientX - contentLeft + (Number(textbox.scrollLeft) || 0);
    if (offset <= 0) {
      return 0;
    }
    if (offset >= fullWidth) {
      return value.length;
    }

    let low = 0;
    let high = value.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (measureSingleLineText(textbox, value.slice(0, mid), style) <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    if (low >= value.length) {
      return value.length;
    }
    const currentWidth = measureSingleLineText(textbox, value.slice(0, low), style);
    const nextWidth = measureSingleLineText(textbox, value.slice(0, low + 1), style);
    return offset > currentWidth + ((nextWidth - currentWidth) / 2) ? low + 1 : low;
  }

  function measureSingleLineText(textbox, text, style) {
    const doc = textbox.ownerDocument || global.document;
    const span = textMeasureSpan(doc);
    if (!span) {
      return String(text || '').length * 8;
    }
    copyTextMeasurementMetrics(style, span);
    span.textContent = text || '';
    return span.getBoundingClientRect().width;
  }

  function textMeasureSpan(doc) {
    if (!doc) {
      return null;
    }
    const existing = TEXT_MEASURE_SPANS.get(doc);
    if (existing?.isConnected) {
      return existing;
    }
    const root = doc.body || doc.documentElement;
    if (!root?.appendChild) {
      return null;
    }
    const span = doc.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    Object.assign(span.style, {
      left: '0',
      pointerEvents: 'none',
      position: 'fixed',
      top: '-10000px',
      visibility: 'hidden',
      whiteSpace: 'pre'
    });
    root.appendChild(span);
    TEXT_MEASURE_SPANS.set(doc, span);
    return span;
  }

  function copyTextMeasurementMetrics(style, span) {
    for (const property of [
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'letterSpacing',
      'tabSize',
      'textIndent',
      'textTransform',
      'wordSpacing'
    ]) {
      span.style[property] = style[property];
    }
  }

  function computedStyle(textbox) {
    const view = textbox.ownerDocument?.defaultView || global;
    return typeof view.getComputedStyle === 'function' ? view.getComputedStyle(textbox) : null;
  }

  function computedLineHeight(style) {
    const lineHeight = cssPixels(style.lineHeight);
    if (lineHeight > 0) {
      return lineHeight;
    }
    return Math.max(1, cssPixels(style.fontSize) * 1.2);
  }

  function cssPixels(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function focusWithoutScrolling(textbox) {
    try {
      textbox.focus({ preventScroll: true });
    } catch {
      textbox.focus();
    }
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
