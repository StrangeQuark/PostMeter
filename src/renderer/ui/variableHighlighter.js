(function attachVariableHighlighter(global) {
  const HIGHLIGHT_STATE = new WeakMap();
  const INTERACTION_STATE = new WeakMap();
  const TEXT_MEASURE_SPANS = new WeakMap();
  const TOOLTIP_ELEMENTS = new WeakMap();
  const VARIABLE_NAME_PATTERN = /^[$A-Za-z0-9_.-]+$/;
  const VARIABLE_TOKEN_PATTERN = /\{\{\s*([^{}\r\n]+?)\s*\}\}|\$\{\s*([^{}\r\n]+?)\s*\}/g;
  const HOVER_VARIABLE_SOURCES = new Set(['environment', 'collection', 'folder', 'request', 'global']);
  const OPENABLE_VARIABLE_SOURCES = new Set(['environment', 'collection', 'folder', 'request']);
  const TEXT_INPUT_TYPES = new Set(['', 'email', 'search', 'tel', 'text', 'url']);
  const TOOLTIP_DELAY_MS = 1000;
  const ACTIVE_HOVER_BY_DOCUMENT = new WeakMap();
  const TOOLTIP_STATE_BY_DOCUMENT = new WeakMap();
  let configuredGetVariables = () => [];
  let configuredOpenVariable = null;
  let configuredShouldShowTooltipHints = () => true;

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
    if (typeof options.onOpenVariable === 'function') {
      setVariableOpenHandler(options.onOpenVariable);
    }
    if (typeof options.showTooltipHints === 'function' || typeof options.showTooltipHints === 'boolean') {
      setVariableTooltipHintsProvider(options.showTooltipHints);
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
    const onResize = () => {
      hideVariableTooltip(doc);
      refreshVariableHighlights(doc);
    };
    const onModifierKeyChange = (event) => updateModifierHoverState(doc, event);
    windowObject.addEventListener?.('resize', onResize);
    doc.addEventListener?.('keydown', onModifierKeyChange);
    doc.addEventListener?.('keyup', onModifierKeyChange);
    return {
      destroy() {
        observer?.disconnect();
        windowObject.removeEventListener?.('resize', onResize);
        doc.removeEventListener?.('keydown', onModifierKeyChange);
        doc.removeEventListener?.('keyup', onModifierKeyChange);
      }
    };
  }

  function enhanceTextbox(textbox) {
    if (!isHighlightableTextbox(textbox)) {
      return null;
    }
    const existing = HIGHLIGHT_STATE.get(textbox);
    if (existing) {
      attachVariableTokenInteractions(textbox, { overlay: existing.overlay });
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
    attachVariableTokenInteractions(textbox, { overlay });
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
    // postmeter-security-allow-html: variable highlighter escapes text and token names before assigning fixed overlay span markup.
    state.code.innerHTML = highlightVariableTokens(textbox.value || '', { target: textbox });
    copyTextboxMetrics(textbox, state.overlay);
    syncScroll(textbox);
    return true;
  }

  function setVariableSource(getVariables) {
    configuredGetVariables = typeof getVariables === 'function' ? getVariables : () => [];
  }

  function setVariableOpenHandler(onOpenVariable) {
    configuredOpenVariable = typeof onOpenVariable === 'function' ? onOpenVariable : null;
  }

  function setVariableTooltipHintsProvider(showTooltipHints) {
    configuredShouldShowTooltipHints = typeof showTooltipHints === 'function'
      ? showTooltipHints
      : () => showTooltipHints !== false;
  }

  function attachVariableTokenInteractions(textbox, options = {}) {
    if (!isInteractiveVariableTextbox(textbox)) {
      return { destroy() {} };
    }
    const existing = INTERACTION_STATE.get(textbox);
    if (existing) {
      existing.overlay = options.overlay || existing.overlay || overlayForTextbox(textbox);
      return existing.publicApi;
    }
    const state = {
      overlay: options.overlay || overlayForTextbox(textbox),
      onMouseDown: (event) => handleVariableTokenMouseDown(textbox, event),
      onMouseLeave: () => clearVariableHoverState(textbox),
      onMouseMove: (event) => handleVariableTokenMouseMove(textbox, event),
      onScroll: () => clearVariableHoverState(textbox),
      publicApi: null
    };
    state.publicApi = {
      destroy() {
        textbox.removeEventListener('mousedown', state.onMouseDown);
        textbox.removeEventListener('mouseleave', state.onMouseLeave);
        textbox.removeEventListener('mousemove', state.onMouseMove);
        textbox.removeEventListener('scroll', state.onScroll);
        INTERACTION_STATE.delete(textbox);
      }
    };
    textbox.addEventListener('mousemove', state.onMouseMove);
    textbox.addEventListener('mouseleave', state.onMouseLeave);
    textbox.addEventListener('mousedown', state.onMouseDown);
    textbox.addEventListener('scroll', state.onScroll);
    INTERACTION_STATE.set(textbox, state);
    return state.publicApi;
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
          source: normalizeVariableSource(variable.source || variable.kind || variable.scope || variable.type),
          value: variableObservableValue(variable)
        });
      }
    }
    return normalized;
  }

  function variableObservableValue(variable) {
    const value = variable?.value
      ?? variable?.currentValue
      ?? variable?.current
      ?? variable?.initialValue
      ?? variable?.initial
      ?? '';
    return String(value ?? '');
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
    if (normalized === 'folder' || normalized === 'foldervariable' || normalized === 'foldervariables') {
      return 'folder';
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
    return !source || source === 'environment' || source === 'collection' || source === 'folder' || source === 'request' || source === 'global';
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
    clearVariableHoverState(textbox);
  }

  function handleVariableTokenMouseMove(textbox, event) {
    const detail = variableTokenDetailFromPointer(textbox, event);
    const doc = textbox.ownerDocument || global.document;
    const source = normalizeVariableSource(detail?.source);
    if (!detail || !HOVER_VARIABLE_SOURCES.has(source)) {
      clearVariableHoverState(textbox);
      return;
    }
    const actionHover = Boolean(OPENABLE_VARIABLE_SOURCES.has(source) && (event.ctrlKey || event.metaKey));
    setActiveVariableHover(doc, textbox, detail);
    setVariableActionHover(detail, actionHover);
    textbox.classList.toggle('has-openable-variable-hover', actionHover);
    scheduleVariableTooltip(doc, variableTooltipText(detail), event, variableDetailKey(detail));
  }

  function handleVariableTokenMouseDown(textbox, event) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || (!event.ctrlKey && !event.metaKey)
    ) {
      return false;
    }
    const detail = variableTokenDetailFromPointer(textbox, event);
    if (!detail) {
      return false;
    }
    if (!HOVER_VARIABLE_SOURCES.has(normalizeVariableSource(detail.source))) {
      return false;
    }
    if (event.shiftKey) {
      return replaceVariableTokenWithValue(textbox, detail, event);
    }
    if (
      !OPENABLE_VARIABLE_SOURCES.has(normalizeVariableSource(detail.source))
      || typeof configuredOpenVariable !== 'function'
    ) {
      return false;
    }
    const handled = configuredOpenVariable({
      ...detail,
      event,
      target: textbox
    }) === true;
    if (!handled) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation?.();
    clearVariableHoverState(textbox);
    return true;
  }

  function variableTokenDetailFromPointer(textbox, event) {
    const token = variableTokenElementFromPoint(textbox, event);
    if (!token) {
      return variableTokenDetailFromTextPointer(textbox, event);
    }
    if (token.getAttribute('data-variable-status') !== 'valid') {
      return null;
    }
    const name = String(token.getAttribute('data-variable-name') || '').trim();
    const source = normalizeVariableSource(token.getAttribute('data-variable-source') || '');
    const variable = resolvedVariableForToken(name, {
      source,
      target: textbox
    });
    if (!variable) {
      return null;
    }
    const range = variableTokenRangeFromElement(textbox, token);
    return {
      end: range.end,
      name,
      start: range.start,
      source: variable.source || source,
      target: textbox,
      token,
      value: variable.value ?? '',
      variable
    };
  }

  function variableTokenDetailFromTextPointer(textbox, event) {
    if (!isInput(textbox) || !Number.isFinite(event.clientX)) {
      return null;
    }
    const index = caretIndexFromClientXWithinText(textbox, event.clientX);
    if (index == null) {
      return null;
    }
    const match = variableTokenMatchAtIndex(
      textbox.value || '',
      index,
      { target: textbox }
    );
    if (!match || match.status !== 'valid') {
      return null;
    }
    if (!clientXInsideTextRange(textbox, event.clientX, match.start, match.end)) {
      return null;
    }
    const variable = resolvedVariableForToken(match.name, {
      source: match.source,
      target: textbox
    });
    if (!variable) {
      return null;
    }
    return {
      end: match.end,
      name: match.name,
      start: match.start,
      source: variable.source || match.source,
      target: textbox,
      token: variableTokenElementForRange(textbox, match.start, match.end),
      value: variable.value ?? '',
      variable
    };
  }

  function variableTokenMatchAtIndex(value, index, options = {}) {
    const text = String(value || '');
    const offset = clampIndex(index, text.length);
    VARIABLE_TOKEN_PATTERN.lastIndex = 0;
    for (let match = VARIABLE_TOKEN_PATTERN.exec(text); match; match = VARIABLE_TOKEN_PATTERN.exec(text)) {
      const token = match[0];
      const start = match.index;
      const end = start + token.length;
      if (offset < start || offset > end) {
        continue;
      }
      const name = String(match[1] || match[2] || '').trim();
      if (!name) {
        return null;
      }
      const source = match[2] == null ? variableTokenSource(name, options) : 'csv';
      return {
        end,
        name,
        source,
        start,
        status: variableTokenStatus(name, { ...options, source })
      };
    }
    return null;
  }

  function variableTokenElementFromPoint(textbox, event) {
    const doc = textbox.ownerDocument || global.document;
    const state = INTERACTION_STATE.get(textbox);
    const overlay = state?.overlay || overlayForTextbox(textbox);
    if (
      !doc
      || !overlay
      || typeof doc.elementFromPoint !== 'function'
      || !Number.isFinite(event.clientX)
      || !Number.isFinite(event.clientY)
    ) {
      return null;
    }
    const previousTextboxPointerEvents = textbox.style.pointerEvents;
    const previousOverlayPointerEvents = overlay.style.pointerEvents;
    try {
      textbox.style.pointerEvents = 'none';
      overlay.style.pointerEvents = 'auto';
      const element = doc.elementFromPoint(event.clientX, event.clientY);
      const token = element?.closest?.('[data-variable-name][data-variable-status]');
      return token && overlay.contains?.(token) ? token : null;
    } finally {
      textbox.style.pointerEvents = previousTextboxPointerEvents;
      overlay.style.pointerEvents = previousOverlayPointerEvents;
    }
  }

  function overlayForTextbox(textbox) {
    return HIGHLIGHT_STATE.get(textbox)?.overlay
      || textbox?.closest?.('.code-editor')?.querySelector?.('.code-editor-highlight')
      || textbox?.closest?.('.variable-highlight-editor')?.querySelector?.('.variable-highlight-overlay')
      || null;
  }

  function variableTokenElementForRange(textbox, start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return null;
    }
    const overlay = overlayForTextbox(textbox);
    for (const token of overlay?.querySelectorAll?.('[data-variable-name][data-variable-status]') || []) {
      const range = variableTokenRangeFromElement(textbox, token);
      if (range.start === start && range.end === end) {
        return token;
      }
    }
    return null;
  }

  function variableTokenRangeFromElement(textbox, token) {
    const root = token?.closest?.('.variable-highlight-code')
      || token?.closest?.('.code-editor-highlight')?.querySelector?.('code')
      || overlayForTextbox(textbox);
    if (!root || !token || !root.contains?.(token)) {
      return { end: null, start: null };
    }
    const start = textLengthBeforeNode(root, token);
    return {
      end: start + String(token.textContent || '').length,
      start
    };
  }

  function textLengthBeforeNode(root, target) {
    let length = 0;
    let found = false;
    const visit = (node) => {
      if (!node || found) {
        return;
      }
      if (node === target) {
        found = true;
        return;
      }
      if (node.nodeType === 3) {
        length += String(node.nodeValue || '').length;
        return;
      }
      for (const child of node.childNodes || []) {
        visit(child);
        if (found) {
          return;
        }
      }
    };
    visit(root);
    return length;
  }

  function resolvedVariableForToken(name, options = {}) {
    const key = String(name || '').trim();
    if (!key || !VARIABLE_NAME_PATTERN.test(key)) {
      return null;
    }
    const source = normalizeVariableSource(options.source || variableTokenSource(key, options));
    return normalizedVariablesForOptions(options, options.target)
      .filter((variable) => variableMatchesSource(variable, source))
      .find((variable) => variable.key === key) || null;
  }

  function variableTooltipText(detail) {
    const value = String(detail.value ?? '');
    if (!shouldShowVariableTooltipHints()) {
      return value;
    }
    const actions = OPENABLE_VARIABLE_SOURCES.has(normalizeVariableSource(detail?.source))
      ? ['Ctrl+click: open variable source', 'Ctrl+Shift+click: replace token with value']
      : ['Ctrl+Shift+click: replace token with value'];
    return `${value}\n\n${actions.join('\n')}`;
  }

  function shouldShowVariableTooltipHints() {
    try {
      return configuredShouldShowTooltipHints() !== false;
    } catch {
      return true;
    }
  }

  function scheduleVariableTooltip(doc, text, event, detailKey) {
    if (!doc) {
      return;
    }
    const existing = TOOLTIP_STATE_BY_DOCUMENT.get(doc);
    if (existing?.detailKey === detailKey && existing.visible) {
      showVariableTooltip(doc, text, event);
      return;
    }
    if (existing?.detailKey === detailKey && existing.timer) {
      existing.text = text;
      existing.event = event;
      return;
    }
    hideVariableTooltip(doc);
    const state = {
      detailKey,
      event,
      text,
      timer: null,
      visible: false
    };
    const view = doc.defaultView || global;
    state.timer = (view.setTimeout || setTimeout)(() => {
      state.timer = null;
      state.visible = true;
      showVariableTooltip(doc, state.text, state.event);
    }, TOOLTIP_DELAY_MS);
    TOOLTIP_STATE_BY_DOCUMENT.set(doc, state);
  }

  function showVariableTooltip(doc, text, event) {
    const tooltip = variableTooltipElement(doc);
    if (!tooltip) {
      return;
    }
    tooltip.textContent = String(text ?? '');
    tooltip.hidden = false;
    positionVariableTooltip(tooltip, event);
  }

  function hideVariableTooltip(doc = global.document) {
    const state = TOOLTIP_STATE_BY_DOCUMENT.get(doc);
    if (state?.timer) {
      const view = doc.defaultView || global;
      (view.clearTimeout || clearTimeout)(state.timer);
    }
    TOOLTIP_STATE_BY_DOCUMENT.delete(doc);
    const tooltip = TOOLTIP_ELEMENTS.get(doc);
    if (tooltip) {
      tooltip.hidden = true;
    }
  }

  function setActiveVariableHover(doc, textbox, detail) {
    const previous = ACTIVE_HOVER_BY_DOCUMENT.get(doc);
    if (previous?.detail !== detail) {
      setVariableActionHover(previous?.detail, false);
    }
    ACTIVE_HOVER_BY_DOCUMENT.set(doc, { detail, textbox });
  }

  function clearVariableHoverState(textbox) {
    const doc = textbox?.ownerDocument || global.document;
    const active = ACTIVE_HOVER_BY_DOCUMENT.get(doc);
    if (active?.textbox === textbox) {
      setVariableActionHover(active.detail, false);
      ACTIVE_HOVER_BY_DOCUMENT.delete(doc);
    }
    textbox?.classList?.remove('has-openable-variable-hover');
    hideVariableTooltip(doc);
  }

  function updateModifierHoverState(doc, event) {
    const active = ACTIVE_HOVER_BY_DOCUMENT.get(doc);
    if (!active?.detail || !active?.textbox) {
      return;
    }
    const source = normalizeVariableSource(active.detail.source);
    const enabled = Boolean(OPENABLE_VARIABLE_SOURCES.has(source) && (event.ctrlKey || event.metaKey));
    setVariableActionHover(active.detail, enabled);
    active.textbox.classList.toggle('has-openable-variable-hover', enabled);
  }

  function setVariableActionHover(detail, enabled) {
    for (const token of variableTokenElementsForDetail(detail)) {
      token?.classList?.toggle('is-variable-highlight-action-hover', enabled === true);
    }
  }

  function variableTokenElementsForDetail(detail) {
    if (!detail) {
      return [];
    }
    if (detail.token) {
      return [detail.token];
    }
    const overlay = overlayForTextbox(detail.target);
    const tokens = Array.from(overlay?.querySelectorAll?.('[data-variable-name][data-variable-status]') || [])
      .filter((token) => {
        if (token.getAttribute('data-variable-name') !== detail.name) {
          return false;
        }
        const source = normalizeVariableSource(token.getAttribute('data-variable-source') || '');
        return !detail.source || source === normalizeVariableSource(detail.source);
      });
    if (Number.isInteger(detail.start) && Number.isInteger(detail.end)) {
      const ranged = tokens.find((token) => {
        const range = variableTokenRangeFromElement(detail.target, token);
        return range.start === detail.start && range.end === detail.end;
      });
      return ranged ? [ranged] : tokens.slice(0, 1);
    }
    return tokens.slice(0, 1);
  }

  function replaceVariableTokenWithValue(textbox, detail, event) {
    const value = String(textbox.value || '');
    if (!Number.isInteger(detail.start) || !Number.isInteger(detail.end) || detail.start < 0 || detail.end < detail.start) {
      return false;
    }
    const replacement = String(detail.value ?? '');
    event.preventDefault();
    event.stopPropagation?.();
    focusWithoutScrolling(textbox);
    const replacedWithUndo = replaceSelectedTextWithUndo(textbox, detail.start, detail.end, replacement);
    if (!replacedWithUndo) {
      textbox.value = `${value.slice(0, detail.start)}${replacement}${value.slice(detail.end)}`;
      const selection = detail.start + replacement.length;
      try {
        textbox.setSelectionRange?.(selection, selection);
      } catch {
        // Some input types expose selection APIs but reject range updates.
      }
      dispatchTextboxInput(textbox);
    }
    clearVariableHoverState(textbox);
    return true;
  }

  function replaceSelectedTextWithUndo(textbox, start, end, replacement) {
    const doc = textbox.ownerDocument || global.document;
    const valueBeforeReplace = String(textbox.value || '');
    try {
      textbox.setSelectionRange?.(start, end);
    } catch {
      return false;
    }
    if (typeof doc?.execCommand !== 'function') {
      return false;
    }
    try {
      doc.execCommand('insertText', false, replacement);
    } catch {
      return false;
    }
    if (String(textbox.value || '') === valueBeforeReplace) {
      return false;
    }
    const selection = start + replacement.length;
    try {
      textbox.setSelectionRange?.(selection, selection);
    } catch {
      // Some input types expose selection APIs but reject range updates.
    }
    return true;
  }

  function dispatchTextboxInput(textbox) {
    const view = textbox.ownerDocument?.defaultView || global;
    const EventConstructor = view.Event || Event;
    textbox.dispatchEvent(new EventConstructor('input', { bubbles: true }));
  }

  function variableDetailKey(detail) {
    return [
      detail?.source || '',
      detail?.name || '',
      detail?.start ?? '',
      detail?.end ?? ''
    ].join(':');
  }

  function variableTooltipElement(doc) {
    if (!doc) {
      return null;
    }
    const existing = TOOLTIP_ELEMENTS.get(doc);
    if (existing?.isConnected) {
      return existing;
    }
    const root = doc.body || doc.documentElement;
    if (!root?.appendChild) {
      return null;
    }
    const tooltip = doc.createElement('div');
    tooltip.className = 'variable-highlight-tooltip';
    tooltip.hidden = true;
    tooltip.setAttribute('role', 'tooltip');
    root.appendChild(tooltip);
    TOOLTIP_ELEMENTS.set(doc, tooltip);
    return tooltip;
  }

  function positionVariableTooltip(tooltip, event) {
    const view = tooltip.ownerDocument?.defaultView || global;
    const viewportWidth = Number(view.innerWidth) || 0;
    const viewportHeight = Number(view.innerHeight) || 0;
    const offset = 12;
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    const rect = tooltip.getBoundingClientRect?.() || { width: 0, height: 0 };
    let left = (Number(event.clientX) || 0) + offset;
    let top = (Number(event.clientY) || 0) + offset;
    if (viewportWidth > 0 && left + rect.width + offset > viewportWidth) {
      left = Math.max(offset, viewportWidth - rect.width - offset);
    }
    if (viewportHeight > 0 && top + rect.height + offset > viewportHeight) {
      top = Math.max(offset, (Number(event.clientY) || 0) - rect.height - offset);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
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
    if (!Number.isFinite(clientX)) {
      return 0;
    }
    const metrics = singleLineTextMetrics(textbox);
    if (!metrics) {
      return String(textbox.value || '').length;
    }
    return caretIndexFromTextOffset(textbox, metrics, textOffsetFromClientX(metrics, clientX));
  }

  function caretIndexFromClientXWithinText(textbox, clientX) {
    const metrics = singleLineTextMetrics(textbox);
    if (!metrics || !Number.isFinite(clientX)) {
      return null;
    }
    if (clientX < metrics.contentAreaLeft || clientX > metrics.contentAreaRight) {
      return null;
    }
    const offset = textOffsetFromClientX(metrics, clientX);
    if (offset <= 0 || offset >= metrics.fullWidth) {
      return null;
    }
    return caretIndexFromTextOffset(textbox, metrics, offset);
  }

  function clientXInsideTextRange(textbox, clientX, start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start || !Number.isFinite(clientX)) {
      return false;
    }
    const metrics = singleLineTextMetrics(textbox);
    if (!metrics) {
      return false;
    }
    const left = metrics.contentLeft + measureSingleLineText(textbox, metrics.value.slice(0, start), metrics.style) - metrics.scrollLeft;
    const right = metrics.contentLeft + measureSingleLineText(textbox, metrics.value.slice(0, end), metrics.style) - metrics.scrollLeft;
    const visibleLeft = Math.max(left, metrics.contentAreaLeft);
    const visibleRight = Math.min(right, metrics.contentAreaRight);
    return visibleRight > visibleLeft && clientX >= visibleLeft && clientX < visibleRight;
  }

  function singleLineTextMetrics(textbox) {
    const value = String(textbox.value || '');
    if (!value) {
      return null;
    }
    const rect = textbox.getBoundingClientRect?.();
    const style = computedStyle(textbox);
    if (!rect || !style) {
      return null;
    }
    const borderLeft = cssPixels(style.borderLeftWidth);
    const borderRight = cssPixels(style.borderRightWidth);
    const paddingLeft = cssPixels(style.paddingLeft);
    const paddingRight = cssPixels(style.paddingRight);
    const availableWidth = Math.max(0, rect.width - borderLeft - borderRight - paddingLeft - paddingRight);
    const fullWidth = measureSingleLineText(textbox, value, style);
    const contentAreaLeft = rect.left + borderLeft + paddingLeft;
    const contentAreaRight = rect.right - borderRight - paddingRight;
    let contentLeft = contentAreaLeft;
    const align = String(style.textAlign || '').toLowerCase();
    if (align === 'center') {
      contentLeft += Math.max(0, (availableWidth - fullWidth) / 2);
    } else if (align === 'right' || align === 'end') {
      contentLeft += Math.max(0, availableWidth - fullWidth);
    }
    return {
      contentAreaLeft,
      contentAreaRight,
      contentLeft,
      fullWidth,
      scrollLeft: Number(textbox.scrollLeft) || 0,
      style,
      value
    };
  }

  function textOffsetFromClientX(metrics, clientX) {
    return clientX - metrics.contentLeft + metrics.scrollLeft;
  }

  function caretIndexFromTextOffset(textbox, metrics, offset) {
    if (offset <= 0) {
      return 0;
    }
    if (offset >= metrics.fullWidth) {
      return metrics.value.length;
    }

    let low = 0;
    let high = metrics.value.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (measureSingleLineText(textbox, metrics.value.slice(0, mid), metrics.style) <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    if (low >= metrics.value.length) {
      return metrics.value.length;
    }
    const currentWidth = measureSingleLineText(textbox, metrics.value.slice(0, low), metrics.style);
    const nextWidth = measureSingleLineText(textbox, metrics.value.slice(0, low + 1), metrics.style);
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

  function clampIndex(index, length) {
    const parsed = Number.isInteger(index) ? index : Number.parseInt(index, 10);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(length, parsed));
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

  function isInteractiveVariableTextbox(element) {
    return isInput(element) || isTextarea(element);
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
    alignSingleLineOverlay(textbox, overlay, style);
  }

  function alignSingleLineOverlay(textbox, overlay, style) {
    if (!isInput(textbox)) {
      return;
    }
    const rect = textbox.getBoundingClientRect?.();
    const height = Number(rect?.height) || cssPixels(style.height);
    const lineHeight = computedLineHeight(style);
    if (!Number.isFinite(height) || height <= 0 || lineHeight <= 0) {
      return;
    }
    const verticalSpace = Math.max(0, height - cssPixels(style.borderTopWidth) - cssPixels(style.borderBottomWidth));
    const paddingTop = Math.max(0, (verticalSpace - lineHeight) / 2);
    const paddingBottom = Math.max(0, verticalSpace - lineHeight - paddingTop);
    overlay.style.paddingTop = `${paddingTop}px`;
    overlay.style.paddingBottom = `${paddingBottom}px`;
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
    attachVariableTokenInteractions,
    enhanceVariableTextboxes,
    highlightVariableTokens,
    install,
    refreshVariableHighlights,
    resolvedVariableForToken,
    setVariableOpenHandler,
    setVariableTooltipHintsProvider,
    setVariableSource
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterVariableHighlighter = exported;
})(typeof window === 'undefined' ? globalThis : window);
