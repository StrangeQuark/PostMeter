(function attachCodeEditor(global) {
  const VariableHighlighter = global.PostMeterVariableHighlighter
    || (typeof require === 'function' ? require('./variableHighlighter') : null);
  const EDITOR_STATE = new WeakMap();
  const EDITOR_TEXTAREAS = new Set();
  const PAIRING_LANGUAGES = new Set(['graphql', 'html', 'javascript', 'json', 'markup', 'xml']);
  const MARKUP_LANGUAGES = new Set(['html', 'markup', 'xml']);
  const HTML_VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
  ]);
  let lineNumbersEnabled = true;
  const JS_KEYWORDS = new Set([
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'of',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield'
  ]);
  const JS_LITERALS = new Set(['false', 'Infinity', 'NaN', 'null', 'true', 'undefined']);
  const OPENING_PAIRS = {
    javascript: {
      '"': '"',
      "'": "'",
      '`': '`',
      '(': ')',
      '[': ']',
      '{': '}'
    },
    json: {
      '"': '"',
      '(': ')',
      '[': ']',
      '{': '}'
    },
    graphql: {
      '"': '"',
      '(': ')',
      '[': ']',
      '{': '}'
    },
    html: {
      '"': '"',
      "'": "'",
      '(': ')',
      '[': ']',
      '{': '}'
    },
    markup: {
      '"': '"',
      "'": "'",
      '(': ')',
      '[': ']',
      '{': '}'
    },
    xml: {
      '"': '"',
      "'": "'",
      '(': ')',
      '[': ']',
      '{': '}'
    }
  };

  function enhanceCodeTextareas(root = global.document) {
    const textareas = codeTextareasFromRoot(root);
    for (const textarea of textareas) {
      enhanceTextarea(textarea);
    }
    return textareas.length;
  }

  function enhanceTextarea(textarea, options = {}) {
    if (!isTextarea(textarea)) {
      return null;
    }
    if (options.language) {
      textarea.dataset.codeLanguage = normalizeLanguage(options.language);
    }
    if (!('codeEditor' in textarea.dataset)) {
      textarea.dataset.codeEditor = 'true';
    }
    const existing = EDITOR_STATE.get(textarea);
    if (existing) {
      refreshEditor(textarea);
      return existing;
    }

    const doc = textarea.ownerDocument || global.document;
    const wrapper = doc.createElement('div');
    wrapper.className = 'code-editor';
    wrapper.hidden = textarea.hidden === true;
    const highlight = doc.createElement('pre');
    highlight.className = 'code-editor-highlight';
    highlight.setAttribute('aria-hidden', 'true');
    const code = doc.createElement('code');
    highlight.append(code);
    const lineNumbers = doc.createElement('pre');
    lineNumbers.className = 'code-editor-line-numbers';
    lineNumbers.setAttribute('aria-hidden', 'true');
    const lineNumberCode = doc.createElement('code');
    lineNumbers.append(lineNumberCode);

    const parent = textarea.parentNode;
    if (parent) {
      parent.insertBefore(wrapper, textarea);
      wrapper.append(highlight, lineNumbers, textarea);
    }
    textarea.classList.add('code-editor-input');
    textarea.autocapitalize = 'off';
    textarea.autocomplete = 'off';

    const state = {
      code,
      highlight,
      lineNumberCode,
      lineNumbers,
      onInput: () => refreshEditor(textarea),
      onKeydown: (event) => handleTextareaKeydown(event, textarea),
      onScroll: () => syncScroll(textarea),
      variableTokenInteractions: null,
      wrapper
    };
    textarea.addEventListener('input', state.onInput);
    textarea.addEventListener('change', state.onInput);
    textarea.addEventListener('keydown', state.onKeydown);
    textarea.addEventListener('scroll', state.onScroll);
    EDITOR_STATE.set(textarea, state);
    state.variableTokenInteractions = VariableHighlighter?.attachVariableTokenInteractions?.(textarea, { overlay: highlight }) || null;
    EDITOR_TEXTAREAS.add(textarea);
    refreshEditor(textarea);
    return state;
  }

  function refreshCodeEditors(root = global.document) {
    const textareas = codeTextareasFromRoot(root);
    for (const textarea of textareas) {
      refreshEditor(textarea);
    }
    return textareas.length;
  }

  function refreshEditor(textarea) {
    const state = EDITOR_STATE.get(textarea);
    if (!state) {
      return false;
    }
    const showLineNumbers = shouldShowLineNumbers(textarea);
    state.wrapper.classList.toggle('has-line-numbers', showLineNumbers);
    state.wrapper.hidden = textarea.hidden === true;
    // postmeter-security-allow-html: code highlighter emits escaped text plus fixed span markup from local textarea content.
    state.code.innerHTML = highlightCode(textarea.value || '', textarea.dataset.codeLanguage || 'text', { target: textarea });
    state.lineNumberCode.textContent = lineNumbersForText(textarea.value || '');
    state.wrapper.style.setProperty('--code-editor-line-number-width', `${lineNumberWidth(textarea.value || '')}ch`);
    copyTextareaMetrics(textarea, state.highlight);
    copyLineNumberMetrics(textarea, state.lineNumbers);
    syncScroll(textarea);
    return true;
  }

  function setLanguage(textarea, language) {
    if (!isTextarea(textarea)) {
      return false;
    }
    textarea.dataset.codeLanguage = normalizeLanguage(language);
    if (!EDITOR_STATE.has(textarea) && 'codeEditor' in textarea.dataset) {
      enhanceTextarea(textarea);
    }
    return refreshEditor(textarea);
  }

  function setLineNumbersEnabled(enabled = true, root = global.document) {
    lineNumbersEnabled = enabled !== false;
    const refreshed = refreshCodeEditors(root);
    if (!refreshed) {
      for (const textarea of EDITOR_TEXTAREAS) {
        refreshEditor(textarea);
      }
    }
    return lineNumbersEnabled;
  }

  function codeEditorLineNumbersEnabled() {
    return lineNumbersEnabled;
  }

  function codeTextareasFromRoot(root) {
    if (!root) {
      return [];
    }
    const textareas = [];
    if (isCodeTextarea(root)) {
      textareas.push(root);
    }
    if (typeof root.querySelectorAll === 'function') {
      textareas.push(...root.querySelectorAll('textarea[data-code-editor]'));
    }
    return [...new Set(textareas)];
  }

  function isCodeTextarea(element) {
    return isTextarea(element)
      && (('codeEditor' in element.dataset) || element.getAttribute?.('data-code-editor') != null);
  }

  function isTextarea(element) {
    return String(element?.tagName || '').toUpperCase() === 'TEXTAREA';
  }

  function shouldShowLineNumbers(textarea) {
    return lineNumbersEnabled && textarea?.dataset?.lineNumbers !== 'false';
  }

  function handleTextareaKeydown(event, textarea) {
    if (textarea.readOnly || textarea.disabled) {
      return;
    }
    const edit = editTextForKey({
      key: event.key,
      language: textarea.dataset.codeLanguage || 'text',
      selectionEnd: textarea.selectionEnd,
      selectionStart: textarea.selectionStart,
      shiftKey: event.shiftKey === true,
      value: textarea.value
    });
    if (!edit.handled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation?.();
    textarea.value = edit.value;
    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    dispatchInput(textarea);
    refreshEditor(textarea);
  }

  function editTextForKey(options = {}) {
    const value = String(options.value || '');
    const start = clampIndex(options.selectionStart, value.length);
    const end = clampIndex(options.selectionEnd ?? start, value.length);
    const key = String(options.key || '');
    const language = normalizeLanguage(options.language || 'text');
    if (key === 'Tab') {
      return options.shiftKey === true
        ? outdentSelection(value, start, end)
        : indentSelection(value, start, end);
    }
    if (!PAIRING_LANGUAGES.has(language)) {
      return unchanged(value, start, end);
    }
    if (key === 'Backspace') {
      const markupDelete = deleteMarkupClosingTag(value, start, end, language);
      if (markupDelete.handled) {
        return markupDelete;
      }
      return deleteEmptyPair(value, start, end, language);
    }
    if (key === 'Enter') {
      const markupEnter = expandMarkupTagNewline(value, start, end, language);
      if (markupEnter.handled) {
        return markupEnter;
      }
      const blockCommentEnter = expandJavaScriptBlockCommentNewline(value, start, end, language);
      if (blockCommentEnter.handled) {
        return blockCommentEnter;
      }
      return expandNewline(value, start, end, language);
    }
    if (key.length !== 1) {
      return unchanged(value, start, end);
    }
    const tagCompletion = completeMarkupTag(value, start, end, key, language);
    if (tagCompletion.handled) {
      return tagCompletion;
    }
    const blockCommentCompletion = completeJavaScriptBlockComment(value, start, end, key, language);
    if (blockCommentCompletion.handled) {
      return blockCommentCompletion;
    }
    return editPairCharacter(value, start, end, key, language);
  }

  function indentSelection(value, start, end) {
    if (start === end) {
      return handled(`${value.slice(0, start)}\t${value.slice(end)}`, start + 1, start + 1);
    }
    const range = selectedLineRange(value, start, end);
    const original = value.slice(range.start, range.end);
    const lines = original.split('\n');
    const replacement = lines.map((line) => `\t${line}`).join('\n');
    const lineCount = lines.length;
    return handled(
      `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`,
      start + 1,
      end + lineCount
    );
  }

  function outdentSelection(value, start, end) {
    const range = selectedLineRange(value, start, end);
    const original = value.slice(range.start, range.end);
    const lines = original.split('\n');
    const starts = [];
    const removals = [];
    let cursor = range.start;
    const replacement = lines.map((line) => {
      starts.push(cursor);
      const count = line.startsWith('\t') ? 1 : (line.startsWith('  ') ? 2 : 0);
      removals.push(count);
      cursor += line.length + 1;
      return line.slice(count);
    }).join('\n');
    const nextValue = `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`;
    const nextStart = start - removedBeforePosition(starts, removals, start);
    const nextEnd = end - removedBeforePosition(starts, removals, end);
    return handled(nextValue, nextStart, Math.max(nextStart, nextEnd));
  }

  function deleteEmptyPair(value, start, end, language) {
    if (start !== end || start === 0 || start >= value.length) {
      return unchanged(value, start, end);
    }
    const pairs = OPENING_PAIRS[language] || {};
    const before = value[start - 1];
    const after = value[start];
    if (pairs[before] !== after) {
      return unchanged(value, start, end);
    }
    return handled(`${value.slice(0, start - 1)}${value.slice(start + 1)}`, start - 1, start - 1);
  }

  function expandNewline(value, start, end, language) {
    if (start !== end) {
      return unchanged(value, start, end);
    }
    const pairs = OPENING_PAIRS[language] || {};
    const before = value[start - 1] || '';
    const after = value[start] || '';
    if (!pairs[before]) {
      return unchanged(value, start, end);
    }
    const indent = lineIndentBefore(value, start);
    if (pairs[before] === after) {
      const insert = `\n${indent}\t\n${indent}`;
      const caret = start + indent.length + 2;
      return handled(`${value.slice(0, start)}${insert}${value.slice(end)}`, caret, caret);
    }
    const insert = `\n${indent}\t`;
    const caret = start + insert.length;
    return handled(`${value.slice(0, start)}${insert}${value.slice(end)}`, caret, caret);
  }

  function editPairCharacter(value, start, end, key, language) {
    const pairs = OPENING_PAIRS[language] || {};
    const openForClose = closeToOpenMap(pairs);
    if (pairs[key]) {
      if (pairs[key] === key && start === end && value[start] === key) {
        return handled(value, start + 1, start + 1);
      }
      const selected = value.slice(start, end);
      const nextValue = `${value.slice(0, start)}${key}${selected}${pairs[key]}${value.slice(end)}`;
      if (start === end) {
        return handled(nextValue, start + 1, start + 1);
      }
      return handled(nextValue, start + 1, end + 1);
    }
    if (openForClose[key] && start === end && value[start] === key) {
      return handled(value, start + 1, start + 1);
    }
    return unchanged(value, start, end);
  }

  function completeJavaScriptBlockComment(value, start, end, key, language) {
    if (language !== 'javascript' || key !== '*' || start !== end || start === 0 || value[start - 1] !== '/') {
      return unchanged(value, start, end);
    }
    if (value.slice(start, start + 2) === '*/') {
      return handled(`${value.slice(0, start)}*${value.slice(end)}`, start + 1, start + 1);
    }
    return handled(`${value.slice(0, start)}**/${value.slice(end)}`, start + 1, start + 1);
  }

  function expandJavaScriptBlockCommentNewline(value, start, end, language) {
    if (language !== 'javascript' || start !== end || value.slice(start - 2, start) !== '/*' || value.slice(start, start + 2) !== '*/') {
      return unchanged(value, start, end);
    }
    const indent = lineIndentBefore(value, start - 2);
    const insert = `\n${indent} * \n${indent} `;
    const caret = start + indent.length + 4;
    return handled(`${value.slice(0, start)}${insert}${value.slice(end)}`, caret, caret);
  }

  function completeMarkupTag(value, start, end, key, language) {
    if (!MARKUP_LANGUAGES.has(language) || key !== '>' || start !== end) {
      return unchanged(value, start, end);
    }
    const tag = openingMarkupTagBefore(value, start, language);
    if (!tag) {
      return unchanged(value, start, end);
    }
    const after = value.slice(end);
    if (matchingClosingTagAt(after, tag.name, language)) {
      return handled(`${value.slice(0, start)}>${after}`, start + 1, start + 1);
    }
    const closingTag = `</${tag.name}>`;
    return handled(`${value.slice(0, start)}>${closingTag}${after}`, start + 1, start + 1);
  }

  function expandMarkupTagNewline(value, start, end, language) {
    if (!MARKUP_LANGUAGES.has(language) || start !== end) {
      return unchanged(value, start, end);
    }
    const tag = openingMarkupTagEndingAt(value, start);
    if (!tag || !matchingClosingTagAt(value.slice(start), tag.name, language)) {
      return unchanged(value, start, end);
    }
    const indent = lineIndentBefore(value, tag.start);
    const insert = `\n${indent}\t\n${indent}`;
    const caret = start + indent.length + 2;
    return handled(`${value.slice(0, start)}${insert}${value.slice(end)}`, caret, caret);
  }

  function deleteMarkupClosingTag(value, start, end, language) {
    if (!MARKUP_LANGUAGES.has(language) || start !== end || start === 0 || value[start - 1] !== '>') {
      return unchanged(value, start, end);
    }
    const tag = openingMarkupTagEndingAt(value, start);
    const closing = tag ? matchingClosingTagAt(value.slice(start), tag.name, language) : null;
    if (!tag || !closing) {
      return unchanged(value, start, end);
    }
    const nextValue = `${value.slice(0, start - 1)}${value.slice(start + closing.length)}`;
    return handled(nextValue, start - 1, start - 1);
  }

  function openingMarkupTagBefore(value, position, language) {
    const lastOpen = value.lastIndexOf('<', position - 1);
    if (lastOpen < 0 || value.lastIndexOf('>', position - 1) > lastOpen) {
      return null;
    }
    const source = value.slice(lastOpen, position);
    if (!isCompletableOpeningMarkupTag(source)) {
      return null;
    }
    const name = markupTagName(source);
    if (!name || (language !== 'xml' && HTML_VOID_ELEMENTS.has(name.toLowerCase()))) {
      return null;
    }
    return { name, source, start: lastOpen };
  }

  function openingMarkupTagEndingAt(value, position) {
    const lastOpen = value.lastIndexOf('<', position - 1);
    if (lastOpen < 0) {
      return null;
    }
    const source = value.slice(lastOpen, position);
    if (!source.endsWith('>') || !isCompletableOpeningMarkupTag(source.slice(0, -1))) {
      return null;
    }
    const name = markupTagName(source);
    return name ? { name, source, start: lastOpen } : null;
  }

  function isCompletableOpeningMarkupTag(source) {
    return /^<[A-Za-z][\w:.-]*(?:\s[\s\S]*)?$/.test(source)
      && !/^<\s*[!?/]/.test(source)
      && !/\/\s*$/.test(source);
  }

  function markupTagName(source) {
    return source.match(/^<([A-Za-z][\w:.-]*)/)?.[1] || '';
  }

  function matchingClosingTagAt(source, name, language) {
    const match = source.match(/^<\/\s*([A-Za-z][\w:.-]*)\s*>/);
    if (!match) {
      return null;
    }
    const sameName = language === 'xml'
      ? match[1] === name
      : match[1].toLowerCase() === name.toLowerCase();
    return sameName ? match[0] : null;
  }

  function selectedLineRange(value, start, end) {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const selectionEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const nextBreak = value.indexOf('\n', selectionEnd);
    return {
      end: nextBreak === -1 ? value.length : nextBreak,
      start: lineStart
    };
  }

  function removedBeforePosition(starts, removals, position) {
    let total = 0;
    for (let index = 0; index < starts.length; index += 1) {
      const lineStart = starts[index];
      if (lineStart >= position) {
        continue;
      }
      total += Math.min(removals[index], Math.max(0, position - lineStart));
    }
    return total;
  }

  function lineIndentBefore(value, index) {
    const lineStart = value.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    const match = /^[\t ]*/.exec(value.slice(lineStart, index));
    return match ? match[0] : '';
  }

  function closeToOpenMap(pairs) {
    const map = {};
    for (const [open, close] of Object.entries(pairs)) {
      map[close] = open;
    }
    return map;
  }

  function clampIndex(index, length) {
    const parsed = Number.isInteger(index) ? index : Number.parseInt(index, 10);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(length, parsed));
  }

  function handled(value, selectionStart, selectionEnd) {
    return { handled: true, selectionEnd, selectionStart, value };
  }

  function unchanged(value, selectionStart, selectionEnd) {
    return { handled: false, selectionEnd, selectionStart, value };
  }

  function highlightCode(value, language = 'text', options = {}) {
    const text = String(value || '');
    const normalized = normalizeLanguage(language);
    const html = VariableHighlighter?.highlightVariableTokens
      ? VariableHighlighter.highlightVariableTokens(text, {
        renderText: (segment) => highlightCodeText(segment, normalized),
        statusClassPrefix: 'tok-variable-',
        target: options.target || null,
        tokenClassName: 'code-editor-token tok-variable',
        variables: options.variables,
        variableNames: options.variableNames,
        isKnownVariable: options.isKnownVariable
      })
      : highlightCodeText(text, normalized);
    if (!html) {
      return '<br>';
    }
    return text.endsWith('\n') ? `${html}<br>` : html;
  }

  function highlightCodeText(text, normalized) {
    if (normalized === 'javascript') {
      return highlightJavaScript(text);
    }
    if (normalized === 'json') {
      return highlightJson(text);
    }
    if (normalized === 'headers') {
      return highlightHeaders(text);
    }
    if (MARKUP_LANGUAGES.has(normalized)) {
      return highlightMarkup(text);
    }
    return escapeHtml(text);
  }

  function highlightJson(text) {
    let output = '';
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      if (/\s/.test(char)) {
        const end = readWhile(text, index, (item) => /\s/.test(item));
        output += escapeHtml(text.slice(index, end));
        index = end;
        continue;
      }
      if (char === '"') {
        const end = readQuoted(text, index, '"');
        const token = text.slice(index, end);
        output += span(nextNonWhitespace(text, end) === ':' ? 'tok-key' : 'tok-string', token);
        index = end;
        continue;
      }
      const numberMatch = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (numberMatch) {
        output += span('tok-number', numberMatch[0]);
        index += numberMatch[0].length;
        continue;
      }
      const literalMatch = text.slice(index).match(/^(?:true|false|null)\b/);
      if (literalMatch) {
        output += span('tok-literal', literalMatch[0]);
        index += literalMatch[0].length;
        continue;
      }
      if (/[\[\]{}:,]/.test(char)) {
        output += span('tok-punctuation', char);
        index += 1;
        continue;
      }
      output += escapeHtml(char);
      index += 1;
    }
    return output;
  }

  function highlightJavaScript(text) {
    let output = '';
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '/' && next === '/') {
        const end = text.indexOf('\n', index + 2);
        const tokenEnd = end === -1 ? text.length : end;
        output += span('tok-comment', text.slice(index, tokenEnd));
        index = tokenEnd;
        continue;
      }
      if (char === '/' && next === '*') {
        const end = text.indexOf('*/', index + 2);
        const tokenEnd = end === -1 ? text.length : end + 2;
        output += span('tok-comment', text.slice(index, tokenEnd));
        index = tokenEnd;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        const end = readQuoted(text, index, char);
        output += span('tok-string', text.slice(index, end));
        index = end;
        continue;
      }
      if (/\s/.test(char)) {
        const end = readWhile(text, index, (item) => /\s/.test(item));
        output += escapeHtml(text.slice(index, end));
        index = end;
        continue;
      }
      const numberMatch = text.slice(index).match(/^(?:0[xX][\dA-Fa-f]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
      if (numberMatch) {
        output += span('tok-number', numberMatch[0]);
        index += numberMatch[0].length;
        continue;
      }
      const identifierMatch = text.slice(index).match(/^[A-Za-z_$][\w$]*/);
      if (identifierMatch) {
        const token = identifierMatch[0];
        const previous = previousNonWhitespace(text, index);
        if (JS_KEYWORDS.has(token)) {
          output += span('tok-keyword', token);
        } else if (JS_LITERALS.has(token)) {
          output += span('tok-literal', token);
        } else if (token === 'pm') {
          output += span('tok-builtin', token);
        } else if (previous === '.') {
          output += span('tok-property', token);
        } else {
          output += escapeHtml(token);
        }
        index += token.length;
        continue;
      }
      if (/[\[\]{}().,;:?+\-*/%=&|!<>~^]/.test(char)) {
        output += span('tok-punctuation', char);
        index += 1;
        continue;
      }
      output += escapeHtml(char);
      index += 1;
    }
    return output;
  }

  function highlightHeaders(text) {
    return String(text || '').split(/(\n)/).map((line) => {
      if (line === '\n') {
        return line;
      }
      const colon = line.indexOf(':');
      if (colon <= 0) {
        return escapeHtml(line);
      }
      return `${span('tok-key', line.slice(0, colon))}${span('tok-punctuation', ':')}${escapeHtml(line.slice(colon + 1))}`;
    }).join('');
  }

  function highlightMarkup(text) {
    return escapeHtml(text).replace(
      /(&lt;\/?)([A-Za-z_][\w:.-]*)([^&]*?)(\/?&gt;)/g,
      (_match, open, name, rest, close) => `${span('tok-punctuation', unescapeHtml(open))}${span('tok-key', name)}${escapeHtml(unescapeHtml(rest))}${span('tok-punctuation', unescapeHtml(close))}`
    );
  }

  function readQuoted(text, start, quote) {
    let index = start + 1;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === quote) {
        return index + 1;
      }
      index += 1;
    }
    return text.length;
  }

  function readWhile(text, start, predicate) {
    let index = start;
    while (index < text.length && predicate(text[index])) {
      index += 1;
    }
    return index;
  }

  function nextNonWhitespace(text, start) {
    for (let index = start; index < text.length; index += 1) {
      if (!/\s/.test(text[index])) {
        return text[index];
      }
    }
    return '';
  }

  function previousNonWhitespace(text, start) {
    for (let index = start - 1; index >= 0; index -= 1) {
      if (!/\s/.test(text[index])) {
        return text[index];
      }
    }
    return '';
  }

  function span(className, text) {
    return `<span class="code-editor-token ${className}">${escapeHtml(text)}</span>`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function unescapeHtml(value) {
    return String(value || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function normalizeLanguage(language) {
    const value = String(language || '').toLowerCase();
    if (value === 'js' || value === 'javascript') {
      return 'javascript';
    }
    if (value === 'json') {
      return 'json';
    }
    if (value === 'graphql' || value === 'gql') {
      return 'graphql';
    }
    if (value === 'headers' || value === 'http-headers') {
      return 'headers';
    }
    if (value === 'html') {
      return 'html';
    }
    if (value === 'xml') {
      return 'xml';
    }
    if (value === 'markup') {
      return 'markup';
    }
    return 'text';
  }

  function copyTextareaMetrics(textarea, highlight) {
    const view = textarea.ownerDocument?.defaultView || global;
    if (typeof view.getComputedStyle !== 'function') {
      return;
    }
    const style = view.getComputedStyle(textarea);
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
      highlight.style[property] = style[property];
    }
  }

  function copyLineNumberMetrics(textarea, lineNumbers) {
    const view = textarea.ownerDocument?.defaultView || global;
    if (typeof view.getComputedStyle !== 'function') {
      return;
    }
    const style = view.getComputedStyle(textarea);
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
      'lineHeight',
      'paddingBottom',
      'paddingTop',
      'tabSize'
    ]) {
      lineNumbers.style[property] = style[property];
    }
  }

  function syncScroll(textarea) {
    const state = EDITOR_STATE.get(textarea);
    if (!state) {
      return;
    }
    state.code.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    state.lineNumberCode.style.transform = `translateY(${-textarea.scrollTop}px)`;
  }

  function lineNumbersForText(text) {
    const count = lineCountForText(text);
    return Array.from({ length: count }, (_value, index) => String(index + 1)).join('\n');
  }

  function lineCountForText(text) {
    return Math.max(1, String(text || '').split('\n').length);
  }

  function lineNumberWidth(text) {
    return Math.max(1, String(lineCountForText(text)).length);
  }

  function dispatchInput(textarea) {
    const view = textarea.ownerDocument?.defaultView || global;
    const EventConstructor = view.Event || global.Event;
    if (typeof textarea.dispatchEvent === 'function' && typeof EventConstructor === 'function') {
      textarea.dispatchEvent(new EventConstructor('input', { bubbles: true }));
    }
  }

  const exported = {
    codeEditorLineNumbersEnabled,
    editTextForKey,
    enhanceCodeTextareas,
    enhanceTextarea,
    highlightCode,
    lineNumbersForText,
    normalizeLanguage,
    refreshCodeEditors,
    refreshEditor,
    setLineNumbersEnabled,
    setLanguage
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterCodeEditor = exported;
})(typeof window === 'undefined' ? globalThis : window);
