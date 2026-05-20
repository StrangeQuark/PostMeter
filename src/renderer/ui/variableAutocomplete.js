(function attachVariableAutocomplete(global) {
  const SCRIPT_INPUT_IDS = new Set([
    'preRequestScriptInput',
    'testScriptInput',
    'collectionPreRequestScriptInput',
    'collectionTestScriptInput'
  ]);
  const SUPPORTED_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'email', 'password', 'tel']);
  const MENU_ID = 'variableAutocompleteMenu';
  const MEASUREMENT_SURFACE_ID = 'variableAutocompleteMeasurementSurface';
  const previousAutocompleteRoles = new WeakMap();

  function isVariableAutocompleteEligible(target) {
    if (!target || typeof target !== 'object') {
      return false;
    }
    const tagName = String(target.tagName || '').toUpperCase();
    if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
      return false;
    }
    if (target.disabled === true || target.readOnly === true || SCRIPT_INPUT_IDS.has(target.id)) {
      return false;
    }
    if (tagName === 'TEXTAREA') {
      return true;
    }
    return SUPPORTED_INPUT_TYPES.has(String(target.type || '').toLowerCase());
  }

  function findVariableToken(value, selectionStart, selectionEnd = selectionStart) {
    if (typeof value !== 'string' || !Number.isInteger(selectionStart) || selectionStart !== selectionEnd) {
      return null;
    }
    const caret = Math.max(0, Math.min(value.length, selectionStart));
    const beforeCaret = value.slice(0, caret);
    const postmanStart = beforeCaret.lastIndexOf('{{');
    const dollarStart = beforeCaret.lastIndexOf('${');
    const useDollarToken = dollarStart > postmanStart;
    const start = useDollarToken ? dollarStart : postmanStart;
    if (start < 0) {
      return null;
    }

    const open = useDollarToken ? '${' : '{{';
    const close = useDollarToken ? '}' : '}}';
    const query = beforeCaret.slice(start + open.length);
    if (query.includes('{{') || query.includes('${') || query.includes('}}') || query.includes('}') || query.includes('\n') || query.includes('\r')) {
      return null;
    }

    let end = caret;
    const afterCaret = value.slice(caret);
    const closeOffset = afterCaret.indexOf(close);
    const nextPostmanOpenOffset = afterCaret.indexOf('{{');
    const nextDollarOpenOffset = afterCaret.indexOf('${');
    const openOffsets = [nextPostmanOpenOffset, nextDollarOpenOffset].filter((offset) => offset >= 0);
    const openOffset = openOffsets.length ? Math.min(...openOffsets) : -1;
    if (closeOffset >= 0 && (openOffset === -1 || closeOffset < openOffset)) {
      end = caret + closeOffset + close.length;
    } else {
      while (end < value.length && !/[\r\n{}$]/.test(value[end])) {
        end += 1;
      }
    }

    return {
      start,
      end,
      open,
      close,
      query
    };
  }

  function buildVariableSuggestions(variables, query = '', options = {}) {
    const items = normalizeSuggestionVariables(variables, suggestionSyntax(options));
    if (!query) {
      return items;
    }
    const normalizedQuery = String(query).toLowerCase();
    const prefixMatches = [];
    const containsMatches = [];
    for (const item of items) {
      const normalizedKey = item.key.toLowerCase();
      if (normalizedKey.startsWith(normalizedQuery)) {
        prefixMatches.push(item);
      } else if (normalizedKey.includes(normalizedQuery)) {
        containsMatches.push(item);
      }
    }
    return prefixMatches.concat(containsMatches);
  }

  function normalizeSuggestionVariables(variables, syntax = 'all') {
    const byKey = new Map();
    for (const variable of variables || []) {
      if (!variable || variable.enabled === false) {
        continue;
      }
      const source = normalizeSuggestionVariableSource(variable.source || variable.kind || variable.scope || variable.type);
      if (!variableMatchesSuggestionSyntax(source, syntax)) {
        continue;
      }
      const key = String(variable.key || '').trim();
      if (!key) {
        continue;
      }
      const item = { key };
      if (source === 'csv') {
        item.showValue = false;
      } else {
        item.value = variable.value == null ? '' : String(variable.value);
      }
      byKey.set(key, item);
    }
    return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  }

  function suggestionSyntax(options = {}) {
    if (!options || typeof options !== 'object') {
      return 'all';
    }
    const syntax = String(options.syntax || '').trim().toLowerCase();
    if (syntax === 'csv' || syntax === 'postman' || syntax === 'all') {
      return syntax;
    }
    if (options.token?.open === '${') {
      return 'csv';
    }
    if (options.token?.open === '{{') {
      return 'postman';
    }
    return 'all';
  }

  function variableMatchesSuggestionSyntax(source, syntax) {
    if (syntax === 'csv') {
      return source === 'csv';
    }
    if (syntax === 'postman') {
      return source !== 'csv';
    }
    return true;
  }

  function normalizeSuggestionVariableSource(source) {
    const normalized = String(source || '').trim().toLowerCase();
    if (normalized === 'csv' || normalized === 'iteration' || normalized === 'iterationdata') {
      return 'csv';
    }
    return normalized;
  }

  function replaceVariableToken(value, token, variableKey) {
    const before = value.slice(0, token.start);
    const after = value.slice(token.end);
    const open = token.open || '{{';
    const close = token.close || '}}';
    const replacement = `${before}${open}${variableKey}${close}${after}`;
    const caret = before.length + open.length + variableKey.length + close.length;
    return {
      value: replacement,
      selectionStart: caret,
      selectionEnd: caret
    };
  }

  function createVariableAutocomplete(options = {}) {
    const doc = options.doc || document;
    const windowObject = options.windowObject || window;
    const getVariables = options.getVariables || (() => []);
    const menu = ensureAutocompleteMenu(doc);
    const measurement = ensureMeasurementSurface(doc);
    const state = {
      items: [],
      selectedIndex: 0,
      target: null,
      token: null
    };

    const removeDocumentListeners = [
      listen(doc, 'focusin', (event) => refresh(event.target, { resetSelection: true }), true),
      listen(doc, 'input', (event) => refresh(event.target, { resetSelection: true }), true),
      listen(doc, 'click', (event) => {
        if (menuContains(menu, event.target)) {
          return;
        }
        refresh(event.target, { resetSelection: true });
      }, true),
      listen(doc, 'keyup', (event) => {
        if (!isVariableAutocompleteEligible(event.target)) {
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
          return;
        }
        refresh(event.target, { resetSelection: false });
      }, true),
      listen(doc, 'keydown', (event) => {
        if (!state.items.length || event.target !== state.target) {
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          state.selectedIndex = Math.min(state.selectedIndex + 1, state.items.length - 1);
          renderMenu(doc, menu, state, chooseItem);
          connectTargetToMenu(state.target, menu, state);
          positionMenu(menu, state.target, state.token, measurement, windowObject);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
          renderMenu(doc, menu, state, chooseItem);
          connectTargetToMenu(state.target, menu, state);
          positionMenu(menu, state.target, state.token, measurement, windowObject);
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          chooseItem(state.selectedIndex);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }, true),
      listen(doc, 'mousedown', (event) => {
        if (menuContains(menu, event.target)) {
          return;
        }
        if (!isVariableAutocompleteEligible(event.target)) {
          close();
        }
      }, true),
      listen(doc, 'scroll', () => close(), true)
    ];

    const removeWindowListeners = [
      listen(windowObject, 'blur', () => close()),
      listen(windowObject, 'resize', () => close())
    ];

    return {
      close,
      destroy() {
        close();
        for (const remove of removeDocumentListeners.concat(removeWindowListeners)) {
          remove();
        }
      },
      refresh
    };

    function refresh(target, { resetSelection = true } = {}) {
      if (!isVariableAutocompleteEligible(target)) {
        close();
        return false;
      }
      const token = findVariableToken(String(target.value || ''), target.selectionStart, target.selectionEnd);
      if (!token) {
        close();
        return false;
      }
      const items = buildVariableSuggestions(getVariables(target), token.query, { token });
      if (!items.length) {
        close();
        return false;
      }
      if (state.target && state.target !== target) {
        disconnectTargetFromMenu(state.target);
      }
      state.target = target;
      state.token = token;
      state.items = items;
      state.selectedIndex = resetSelection ? 0 : Math.max(0, Math.min(state.selectedIndex, items.length - 1));
      renderMenu(doc, menu, state, chooseItem);
      connectTargetToMenu(target, menu, state);
      positionMenu(menu, target, token, measurement, windowObject);
      return true;
    }

    function chooseItem(index) {
      const target = state.target;
      const token = state.token;
      const item = state.items[index];
      if (!target || !token || !item) {
        close();
        return;
      }
      const replacement = replaceVariableToken(String(target.value || ''), token, item.key);
      target.value = replacement.value;
      if (typeof target.setSelectionRange === 'function') {
        target.setSelectionRange(replacement.selectionStart, replacement.selectionEnd);
      } else {
        target.selectionStart = replacement.selectionStart;
        target.selectionEnd = replacement.selectionEnd;
      }
      target.focus?.();
      close();
      dispatchInputEvent(target, windowObject);
    }

    function close() {
      disconnectTargetFromMenu(state.target);
      state.items = [];
      state.selectedIndex = 0;
      state.target = null;
      state.token = null;
      menu.hidden = true;
      menu.textContent = '';
    }
  }

  function ensureAutocompleteMenu(doc) {
    let menu = doc.getElementById ? doc.getElementById(MENU_ID) : null;
    if (menu) {
      return menu;
    }
    menu = doc.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'variable-autocomplete';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Environment variables');
    (doc.body || doc.documentElement || doc).append(menu);
    return menu;
  }

  function ensureMeasurementSurface(doc) {
    let root = doc.getElementById ? doc.getElementById(MEASUREMENT_SURFACE_ID) : null;
    if (!root) {
      root = doc.createElement('div');
      root.id = MEASUREMENT_SURFACE_ID;
      root.setAttribute('aria-hidden', 'true');
      root.style.position = 'fixed';
      root.style.left = '0';
      root.style.top = '0';
      root.style.visibility = 'hidden';
      root.style.pointerEvents = 'none';
      root.style.whiteSpace = 'pre-wrap';
      root.style.wordBreak = 'break-word';
      root.style.overflowWrap = 'break-word';
      root.style.margin = '0';
      root.style.borderColor = 'transparent';
      root.style.background = 'transparent';
      root.style.color = 'transparent';
      root.style.overflow = 'hidden';
      root.style.zIndex = '-1';
      const before = doc.createElement('span');
      before.dataset.variableAutocompletePart = 'before';
      const marker = doc.createElement('span');
      marker.dataset.variableAutocompletePart = 'marker';
      marker.textContent = '{{';
      root.append(before, marker);
      (doc.body || doc.documentElement || doc).append(root);
    }
    return {
      root,
      before: root.querySelector('[data-variable-autocomplete-part="before"]'),
      marker: root.querySelector('[data-variable-autocomplete-part="marker"]')
    };
  }

  function renderMenu(doc, menu, state, chooseItem) {
    menu.textContent = '';
    state.items.forEach((item, index) => {
      const option = doc.createElement('div');
      option.id = `${MENU_ID}Option${index}`;
      option.className = 'variable-autocomplete-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', index === state.selectedIndex ? 'true' : 'false');
      if (index === state.selectedIndex) {
        option.classList.add('active');
      }
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        chooseItem(index);
      });

      const key = doc.createElement('span');
      key.className = 'variable-autocomplete-key';
      key.textContent = item.key;

      if (item.showValue === false) {
        option.classList.add('is-key-only');
        option.append(key);
      } else {
        const value = doc.createElement('span');
        value.className = 'variable-autocomplete-value';
        value.textContent = item.value || 'Empty value';
        option.append(key, value);
      }
      menu.append(option);
    });
    menu.hidden = false;
  }

  function connectTargetToMenu(target, menu, state) {
    if (!target?.setAttribute) {
      return;
    }
    const activeOption = menu.querySelector?.(`#${MENU_ID}Option${state.selectedIndex}`);
    const tagName = String(target.tagName || '').toUpperCase();
    if (tagName === 'INPUT' && !previousAutocompleteRoles.has(target)) {
      previousAutocompleteRoles.set(target, target.getAttribute?.('role') ?? null);
      target.setAttribute('role', 'combobox');
    }
    target.setAttribute('aria-autocomplete', 'list');
    target.setAttribute('aria-controls', menu.id || MENU_ID);
    target.setAttribute('aria-expanded', 'true');
    target.setAttribute('aria-haspopup', 'listbox');
    if (activeOption?.id) {
      target.setAttribute('aria-activedescendant', activeOption.id);
    }
  }

  function disconnectTargetFromMenu(target) {
    if (!target?.removeAttribute) {
      return;
    }
    target.removeAttribute('aria-activedescendant');
    target.removeAttribute('aria-autocomplete');
    target.removeAttribute('aria-controls');
    target.removeAttribute('aria-expanded');
    target.removeAttribute('aria-haspopup');
    if (previousAutocompleteRoles.has(target)) {
      const previousRole = previousAutocompleteRoles.get(target);
      previousAutocompleteRoles.delete(target);
      if (previousRole == null) {
        target.removeAttribute('role');
      } else {
        target.setAttribute('role', previousRole);
      }
    }
  }

  function positionMenu(menu, target, token, measurement, windowObject) {
    const fieldRect = target?.getBoundingClientRect?.();
    if (!fieldRect) {
      return;
    }
    const anchorRect = measureTokenAnchorRect(target, token, measurement, windowObject) || fieldRect;
    const viewportWidth = windowObject?.innerWidth || 1280;
    const viewportHeight = windowObject?.innerHeight || 720;
    const width = Math.min(Math.max(fieldRect.width || 0, 220), 420, Math.max(220, viewportWidth - 16));
    menu.style.width = `${width}px`;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const menuHeight = menu.offsetHeight || 0;
    const { left, top } = menuPositionFromAnchor(anchorRect, width, menuHeight, viewportWidth, viewportHeight);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function measureTokenAnchorRect(target, token, measurement, windowObject) {
    const fieldRect = target?.getBoundingClientRect?.();
    if (!fieldRect || !measurement?.root || !measurement.before || !measurement.marker || !token) {
      return null;
    }
    const computed = readComputedStyle(target, windowObject);
    if (!computed) {
      return null;
    }
    syncMeasurementSurface(measurement.root, target, fieldRect, computed);
    measurement.before.textContent = String(target.value || '').slice(0, token.start);
    measurement.marker.textContent = token.open || String(target.value || '').slice(token.start, token.start + 2) || '{{';
    const markerRect = measurement.marker.getBoundingClientRect();
    if (!Number.isFinite(markerRect.left) || !Number.isFinite(markerRect.top)) {
      return null;
    }
    const scrollLeft = Number(target.scrollLeft) || 0;
    const scrollTop = Number(target.scrollTop) || 0;
    return {
      left: markerRect.left - scrollLeft,
      top: markerRect.top - scrollTop,
      bottom: markerRect.bottom - scrollTop
    };
  }

  function syncMeasurementSurface(root, target, fieldRect, computed) {
    root.style.left = `${fieldRect.left}px`;
    root.style.top = `${fieldRect.top}px`;
    root.style.width = `${fieldRect.width}px`;
    root.style.height = `${fieldRect.height}px`;
    root.style.boxSizing = computed.boxSizing;
    root.style.padding = computed.padding;
    root.style.borderStyle = computed.borderStyle;
    root.style.borderWidth = computed.borderWidth;
    root.style.font = computed.font;
    root.style.fontFamily = computed.fontFamily;
    root.style.fontSize = computed.fontSize;
    root.style.fontStyle = computed.fontStyle;
    root.style.fontVariant = computed.fontVariant;
    root.style.fontWeight = computed.fontWeight;
    root.style.letterSpacing = computed.letterSpacing;
    root.style.lineHeight = computed.lineHeight;
    root.style.textAlign = computed.textAlign;
    root.style.textIndent = computed.textIndent;
    root.style.textTransform = computed.textTransform;
    root.style.direction = computed.direction;
    root.style.tabSize = computed.tabSize;
    root.style.wordSpacing = computed.wordSpacing;
    if (String(target.tagName || '').toUpperCase() === 'TEXTAREA') {
      root.style.whiteSpace = 'pre-wrap';
      root.style.wordBreak = 'break-word';
      root.style.overflowWrap = 'break-word';
    } else {
      root.style.whiteSpace = 'pre';
      root.style.wordBreak = 'normal';
      root.style.overflowWrap = 'normal';
    }
  }

  function readComputedStyle(target, windowObject) {
    const read = windowObject?.getComputedStyle || global.getComputedStyle;
    return typeof read === 'function' ? read(target) : null;
  }

  function menuPositionFromAnchor(anchorRect, width, height, viewportWidth, viewportHeight) {
    const left = Math.max(8, Math.min(anchorRect.left || 0, viewportWidth - width - 8));
    const top = (anchorRect.bottom || 0) + height + 8 <= viewportHeight
      ? (anchorRect.bottom || 0) + 4
      : Math.max(8, (anchorRect.top || 0) - height - 4);
    return { left, top };
  }

  function dispatchInputEvent(target, windowObject) {
    const EventConstructor = windowObject?.Event || global.Event;
    if (typeof target.dispatchEvent === 'function' && typeof EventConstructor === 'function') {
      target.dispatchEvent(new EventConstructor('input', { bubbles: true }));
    }
  }

  function menuContains(menu, target) {
    if (!menu || !target) {
      return false;
    }
    if (typeof menu.contains === 'function') {
      return menu.contains(target);
    }
    return menu === target;
  }

  function listen(target, eventName, handler, options) {
    if (!target?.addEventListener) {
      return () => {};
    }
    target.addEventListener(eventName, handler, options);
    return () => target.removeEventListener?.(eventName, handler, options);
  }

  const exported = {
    MENU_ID,
    buildVariableSuggestions,
    createVariableAutocomplete,
    findVariableToken,
    isVariableAutocompleteEligible,
    menuPositionFromAnchor,
    replaceVariableToken
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterVariableAutocomplete = exported;
})(typeof window === 'undefined' ? globalThis : window);
