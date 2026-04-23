function initResizablePanes() {
  restoreLayout();
  setupDragResize('mainPaneResize', (event) => {
    const maxWidth = Math.max(260, Math.min(560, window.innerWidth - 520));
    setLayoutVar('--sidebar-width', `${clampLayoutValue(event.clientX, 220, maxWidth)}px`);
  }, '--sidebar-width');
  setupDragResize('sidebarPaneResize', (event) => {
    const sidebar = document.querySelector('.sidebar');
    const rect = sidebar.getBoundingClientRect();
    const maxHeight = Math.max(140, rect.height - 190);
    setLayoutVar('--history-height', `${clampLayoutValue(rect.bottom - event.clientY - 10, 120, maxHeight)}px`);
  }, '--history-height');
  setupDragResize('workspacePaneResize', (event) => {
    const workspaceElement = document.querySelector('.workspace');
    const rect = workspaceElement.getBoundingClientRect();
    const maxHeight = Math.max(260, rect.height - 220);
    setLayoutVar('--request-height', `${clampLayoutValue(event.clientY - rect.top - 10, 240, maxHeight)}px`);
  }, '--request-height');
  setupDragResize('responsePaneResize', (event) => {
    const grid = document.querySelector('.response-grid');
    const rect = grid.getBoundingClientRect();
    setLayoutVar('--response-body-width', `${clampLayoutValue(event.clientX - rect.left, 220, Math.max(220, rect.width - 220))}px`);
  }, '--response-body-width');
}

function setupDragResize(id, update, cssVariable) {
  const handle = document.getElementById(id);
  if (!handle) {
    return;
  }
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const resizeClass = handle.classList.contains('horizontal') ? 'is-resizing-row' : 'is-resizing-col';
    document.body.classList.add('is-resizing', resizeClass);
    const onMouseMove = (moveEvent) => update(moveEvent);
    const onMouseUp = () => {
      document.body.classList.remove('is-resizing', resizeClass);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  handle.addEventListener('dblclick', () => resetLayoutVar(cssVariable));
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
    '--history-height': '210px',
    '--request-height': '52%',
    '--response-body-width': '1.25fr'
  };
}

function layoutStorageKey(name) {
  return `postmeter.layout.${name}`;
}

function clampLayoutValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
