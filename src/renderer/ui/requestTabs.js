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
    const wrapper = doc.createElement('div');
    const typeClasses = String(group.buttonClassName || '')
      .split(/\s+/)
      .filter((className) => className && className !== 'request-tab-button');
    wrapper.className = ['request-tab-item', ...typeClasses].join(' ');
    wrapper.setAttribute('role', 'presentation');
    const button = doc.createElement('div');
    button.className = group.buttonClassName || 'request-tab-button';
    const isActive = group.isActive?.(tab) === true;
    wrapper.classList.toggle('active', isActive);
    button.classList.toggle('active', isActive);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.setAttribute('aria-label', group.title?.(item, tab) || 'Open tab');
    button.setAttribute('data-open-tab-key', tab?.key || '');
    button.setAttribute('data-open-tab-kind', group.kind || '');
    const tabId = group.tabId?.(tab, item) || stableTabId(group.idPrefix || 'open-tab', tab);
    button.id = tabId;
    if (group.controlsId) {
      button.setAttribute('aria-controls', group.controlsId);
      if (isActive) {
        const panel = doc.getElementById(group.controlsId);
        panel?.setAttribute?.('aria-labelledby', tabId);
      }
    }
    button.tabIndex = isActive ? 0 : -1;
    button.title = group.title?.(item, tab) || '';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const openContextMenu = (event, menuOptions = {}) => {
      event.preventDefault();
      event.stopPropagation();
      group.onContextMenu?.(event, tab, item, {
        trigger: button,
        keyboard: menuOptions.keyboard === true,
        x: menuOptions.x,
        y: menuOptions.y
      });
    };
    wrapper.addEventListener('contextmenu', (event) => {
      openContextMenu(event, { keyboard: false });
    });
    button.addEventListener('click', () => group.onSelect?.(tab, item));
    button.addEventListener('contextmenu', (event) => {
      openContextMenu(event, { keyboard: false });
    });
    button.addEventListener('keydown', (event) => {
      if (moveOpenTabFocus(event, button)) {
        return;
      }
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        const rect = button.getBoundingClientRect?.() || { left: 0, bottom: 0 };
        openContextMenu(event, {
          keyboard: true,
          x: rect.left + 16,
          y: rect.bottom + 4
        });
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        group.onSelect?.(tab, item);
        return;
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        void group.onClose?.(tab, item);
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
    close.tabIndex = -1;
    close.addEventListener('click', async (event) => {
      event.stopPropagation();
      await group.onClose?.(tab, item);
    });

    button.append(dirty, method, title);
    wrapper.append(button, close);
    return wrapper;
  }

  function moveOpenTabFocus(event, button) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return false;
    }
    const bar = button.closest?.('[role="tablist"]') || button.parentElement;
    const tabs = Array.from(bar?.querySelectorAll('[role="tab"]') || []);
    if (!tabs.length) {
      return false;
    }
    event.preventDefault();
    const currentIndex = Math.max(0, tabs.indexOf(button));
    let nextIndex = currentIndex;
    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex + tabs.length - 1) % tabs.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    }
    const nextTab = tabs[nextIndex];
    const nextTabId = nextTab?.id || '';
    tabs.forEach((tab, index) => {
      tab.tabIndex = index === nextIndex ? 0 : -1;
    });
    nextTab?.click?.();
    const refreshedTab = nextTabId ? bar?.ownerDocument?.getElementById?.(nextTabId) : null;
    (refreshedTab || nextTab)?.focus?.();
    return true;
  }

  function stableTabId(prefix, tab) {
    return `${prefix}-${String(tab?.key || tab?.id || 'tab').replace(/[^A-Za-z0-9_-]+/g, '-')}`;
  }

  const exported = {
    renderRequestTabs
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRequestTabs = exported;
})(typeof window === 'undefined' ? globalThis : window);
