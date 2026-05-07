function initResizablePanes() {
  restoreLayout();
  setupDragResize('mainPaneResize', {
    cssVariable: '--sidebar-width',
    fallbackPixels: 300,
    label: 'Resize sidebar',
    orientation: 'vertical',
    max: () => Math.max(260, Math.min(560, window.innerWidth - 520)),
    min: 220,
    valueFromEvent: (event) => event.clientX
  });
  setupDragResize('workspacePaneResize', {
    cssVariable: '--request-height',
    fallbackPixels: 360,
    label: 'Resize request editor and response panels',
    orientation: 'horizontal',
    currentPixels: () => measuredElementPixels('#requestEditorPanel', 'height'),
    max: () => {
      const workspaceElement = document.querySelector('.workspace');
      const rect = workspaceElement.getBoundingClientRect();
      return Math.max(260, rect.height - 220);
    },
    min: 240,
    valueFromEvent: (event) => {
      const workspaceElement = document.querySelector('.workspace');
      const rect = workspaceElement.getBoundingClientRect();
      return event.clientY - rect.top - 10;
    }
  });
  setupDragResize('runnerResultsResize', {
    cssVariable: '--runner-editor-height',
    fallbackPixels: 360,
    label: 'Resize runner configuration and results panels',
    orientation: 'horizontal',
    currentPixels: () => measuredElementPixels('#runnerEditorSection', 'height'),
    max: () => {
      const panel = document.getElementById('runnerMainPanel');
      const panelRect = panel?.getBoundingClientRect?.() || { height: 0 };
      return Math.max(220, panelRect.height - 210);
    },
    min: 220,
    valueFromEvent: (event) => {
      const editor = document.getElementById('runnerEditorSection');
      const rect = editor?.getBoundingClientRect?.() || { top: 0 };
      return event.clientY - rect.top;
    }
  });
  setupDragResize('performanceSettingsResize', {
    cssVariable: '--performance-request-height',
    fallbackPixels: 320,
    label: 'Resize performance request builder and settings panels',
    orientation: 'horizontal',
    currentPixels: () => measuredElementPixels('#performanceRequestSection', 'height'),
    max: () => {
      const panel = document.getElementById('performanceMainPanel');
      const panelRect = panel?.getBoundingClientRect?.() || { height: 0 };
      return Math.max(220, panelRect.height - 276);
    },
    min: 220,
    valueFromEvent: (event) => {
      const section = document.getElementById('performanceRequestSection');
      const rect = section?.getBoundingClientRect?.() || { top: 0 };
      return event.clientY - rect.top;
    }
  });
  setupDragResize('performanceResultsResize', {
    cssVariable: '--performance-editor-height',
    fallbackPixels: 160,
    label: 'Resize performance settings and results panels',
    orientation: 'horizontal',
    currentPixels: () => measuredElementPixels('#performanceEditorSection', 'height'),
    max: () => {
      const panel = document.getElementById('performanceMainPanel');
      const requestSection = document.getElementById('performanceRequestSection');
      const panelRect = panel?.getBoundingClientRect?.() || { height: 0 };
      const requestHeight = requestSection?.getBoundingClientRect?.().height || currentLayoutPixels('--performance-request-height', 320);
      return Math.max(96, panelRect.height - requestHeight - 140);
    },
    min: 96,
    valueFromEvent: (event) => {
      const editor = document.getElementById('performanceEditorSection');
      const rect = editor?.getBoundingClientRect?.() || { top: 0 };
      return event.clientY - rect.top;
    }
  });
}

function setupDragResize(id, config) {
  const handle = document.getElementById(id);
  if (!handle) {
    return;
  }
  configureSplitterAccessibility(handle, config);
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const isHorizontal = handle.classList.contains('horizontal');
    const resizeClass = isHorizontal ? 'is-resizing-row' : 'is-resizing-col';
    document.body.classList.add('is-resizing', resizeClass);
    const startPointerValue = isHorizontal ? event.clientY : event.clientX;
    const startLayoutValue = currentLayoutPixels(config.cssVariable, config.fallbackPixels, config);
    const onMouseMove = (moveEvent) => {
      const pointerValue = isHorizontal ? moveEvent.clientY : moveEvent.clientX;
      const pointerDelta = pointerValue - startPointerValue;
      applySplitterValue(handle, config, startLayoutValue + pointerDelta);
    };
    const onMouseUp = () => {
      document.body.classList.remove('is-resizing', resizeClass);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  handle.addEventListener('dblclick', () => {
    resetLayoutVar(config.cssVariable);
    configureSplitterAccessibility(handle, config);
  });
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 64 : 16;
    const current = currentLayoutPixels(config.cssVariable, config.fallbackPixels, config);
    let next = current;
    if (event.key === 'Home') {
      next = normalizedSplitterBounds(config).min;
    } else if (event.key === 'End') {
      next = normalizedSplitterBounds(config).max;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      resetLayoutVar(config.cssVariable);
      configureSplitterAccessibility(handle, config);
      return;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = current - step;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = current + step;
    } else {
      return;
    }
    event.preventDefault();
    applySplitterValue(handle, config, next);
  });
}

function configureSplitterAccessibility(handle, config, valueOverride) {
  const { min, max } = normalizedSplitterBounds(config);
  const rawValue = Number.isFinite(valueOverride)
    ? valueOverride
    : currentLayoutPixels(config.cssVariable, config.fallbackPixels, config);
  const value = clampLayoutValue(rawValue, min, max);
  handle.setAttribute('aria-label', config.label);
  handle.setAttribute('aria-valuemin', String(Math.round(min)));
  handle.setAttribute('aria-valuemax', String(Math.round(max)));
  handle.setAttribute('aria-valuenow', String(Math.round(value)));
}

function applySplitterValue(handle, config, value) {
  const { min, max } = normalizedSplitterBounds(config);
  const next = clampLayoutValue(value, min, max);
  setLayoutVar(config.cssVariable, `${next}px`);
  configureSplitterAccessibility(handle, config, next);
}

function normalizedSplitterBounds(config) {
  const min = Number(config.min || 0);
  const max = typeof config.max === 'function' ? Number(config.max()) : Number(config.max);
  return {
    min,
    max: Math.max(min, Number.isFinite(max) ? max : min)
  };
}

function currentLayoutPixels(name, fallbackPixels, config = {}) {
  if (typeof config.currentPixels === 'function') {
    const measured = Number(config.currentPixels());
    if (Number.isFinite(measured) && measured > 0) {
      return measured;
    }
  }
  const value = readLayoutVar(name) || getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(value);
  if (Number.isFinite(parsed) && /px\s*$/.test(String(value).trim())) {
    return parsed;
  }
  return fallbackPixels;
}

function measuredElementPixels(selector, dimension) {
  const target = document.querySelector(selector);
  if (!target?.getBoundingClientRect) {
    return 0;
  }
  const rect = target.getBoundingClientRect();
  return dimension === 'height' ? rect.height : rect.width;
}

function restoreLayout() {
  for (const [name, fallback] of Object.entries(defaultLayoutVars())) {
    const value = readLayoutVar(name) || fallback;
    document.documentElement.style.setProperty(name, value);
  }
}

function setLayoutVar(name, value) {
  document.documentElement.style.setProperty(name, value);
  try {
    localStorage.setItem(layoutStorageKey(name), value);
  } catch {
    // Ignore storage failures; resizing still works for the current session.
  }
}

function resetLayoutVar(name) {
  const fallback = defaultLayoutVars()[name];
  if (!fallback) {
    return;
  }
  document.documentElement.style.setProperty(name, fallback);
  try {
    localStorage.removeItem(layoutStorageKey(name));
  } catch {
    // Ignore storage failures.
  }
}

function readLayoutVar(name) {
  try {
    return localStorage.getItem(layoutStorageKey(name));
  } catch {
    return null;
  }
}

function defaultLayoutVars() {
  return {
    '--sidebar-width': '300px',
    '--request-height': '52%',
    '--runner-editor-height': '52%',
    '--performance-request-height': '320px',
    '--performance-editor-height': 'max-content'
  };
}

function layoutStorageKey(name) {
  return `postmeter.layout.${name}`;
}

function clampLayoutValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
