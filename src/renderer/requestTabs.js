(function attachRequestTabs(global) {
  function renderRequestTabs(options = {}) {
    const doc = options.doc || document;
    const bar = doc.getElementById(options.barId || 'requestTabBar');
    const groups = Array.isArray(options.groups) ? options.groups : [];

    bar.textContent = '';
    const hasTabs = groups.some((group) => Array.isArray(group.tabs) && group.tabs.length > 0);
    bar.hidden = !hasTabs;
    if (bar.hidden) {
      return;
    }

    for (const group of groups) {
      for (const tab of group.tabs || []) {
        const item = group.resolve?.(tab);
        if (!item) {
          continue;
        }
        bar.append(createTabButton(doc, tab, item, group));
      }
    }
  }

  function createTabButton(doc, tab, item, group) {
    const button = doc.createElement('div');
    button.className = group.buttonClassName || 'request-tab-button';
    const isActive = group.isActive?.(tab) === true;
    button.classList.toggle('active', isActive);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = 0;
    button.title = group.title?.(item, tab) || '';
    button.addEventListener('click', () => group.onSelect?.(tab, item));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        group.onSelect?.(tab, item);
      }
    });

    const dirty = doc.createElement('span');
    dirty.className = 'request-tab-dirty';
    dirty.hidden = !tab.dirty;
    dirty.setAttribute('aria-label', 'Unsaved changes');

    const method = doc.createElement('span');
    const methodText = group.methodText?.(item, tab) || '';
    method.className = ['request-tab-method', group.methodClassName?.(item, tab) || ''].filter(Boolean).join(' ');
    method.textContent = methodText;

    const title = doc.createElement('span');
    title.className = 'request-tab-title';
    title.textContent = group.title?.(item, tab) || '';

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'request-tab-close';
    close.textContent = '\u00d7';
    close.title = group.closeTitle?.(item, tab) || '';
    close.setAttribute('aria-label', group.closeAriaLabel?.(item, tab) || close.title);
    close.addEventListener('click', async (event) => {
      event.stopPropagation();
      await group.onClose?.(tab, item);
    });

    button.append(dirty, method, title, close);
    return button;
  }

  const exported = {
    renderRequestTabs
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRequestTabs = exported;
})(typeof window === 'undefined' ? globalThis : window);
