let activeContextMenuTrigger = null;
let keyboardContextMenuActivation = false;

function attachTreeContextMenu(button, items) {
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event.clientX, event.clientY, items, { trigger: button });
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      showContextMenu(rect.left + 16, rect.bottom + 4, items, { focusFirst: true, trigger: button });
    }
  });
}

function showContextMenu(x, y, items, options = {}) {
  const menu = document.getElementById('contextMenu');
  closeContextMenu();
  activeContextMenuTrigger = options.trigger || null;
  activeContextMenuTrigger?.setAttribute?.('aria-expanded', 'true');
  menu.textContent = '';
  for (const item of items) {
    appendContextMenuItem(menu, item);
  }
  menu.onkeydown = handleContextMenuKeydown;
  menu.hidden = false;
  menu.style.left = '0';
  menu.style.top = '0';
  const maxX = window.innerWidth - menu.offsetWidth - 8;
  const maxY = window.innerHeight - menu.offsetHeight - 8;
  menu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
  if (options.focusFirst === true) {
    menu.querySelector('button')?.focus?.();
  }
}

function appendContextMenuItem(parent, item) {
  const [label, handler, variant] = item;
  if (Array.isArray(handler)) {
    const row = document.createElement('div');
    row.className = 'context-submenu-row';
    row.setAttribute('role', 'none');

    const button = contextMenuButton(label, variant);
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setAttribute('aria-expanded', 'true');
      button.focus?.();
    });

    const submenu = document.createElement('div');
    submenu.className = 'context-submenu';
    submenu.setAttribute('role', 'menu');
    submenu.setAttribute('aria-label', `${label} options`);
    for (const child of handler) {
      appendContextMenuItem(submenu, child);
    }
    row.append(button, submenu);
    parent.append(row);
    return;
  }

  const button = contextMenuButton(label, variant);
  button.addEventListener('click', () => {
    closeContextMenu({ restoreFocus: keyboardContextMenuActivation === true });
    handler();
  });
  parent.append(button);
}

function contextMenuButton(label, variant) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'menuitem');
  button.className = variant === 'danger' ? 'danger' : '';
  button.textContent = label;
  return button;
}

function handleContextMenuKeydown(event) {
  const menu = document.getElementById('contextMenu');
  if (event.key === 'Escape') {
    event.preventDefault();
    closeContextMenu({ restoreFocus: true });
    return;
  }
  if (event.key === 'Tab') {
    closeContextMenu();
    return;
  }
  if (event.key === 'ArrowRight' && isContextSubmenuTrigger(event.target)) {
    event.preventDefault();
    event.target.setAttribute('aria-expanded', 'true');
    event.target.parentElement?.querySelector?.('.context-submenu button:not([disabled])')?.focus?.();
    return;
  }
  if (event.key === 'ArrowLeft' && event.target?.closest?.('.context-submenu')) {
    event.preventDefault();
    event.target.closest('.context-submenu-row')?.querySelector?.(':scope > button[aria-haspopup="menu"]')?.focus?.();
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && isContextSubmenuTrigger(event.target)) {
    event.preventDefault();
    event.target.setAttribute('aria-expanded', 'true');
    event.target.parentElement?.querySelector?.('.context-submenu button:not([disabled])')?.focus?.();
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && isEnabledMenuButton(event.target)) {
    event.preventDefault();
    keyboardContextMenuActivation = true;
    try {
      event.target.click();
    } finally {
      keyboardContextMenuActivation = false;
    }
    return;
  }
  const buttons = contextMenuNavigationButtons(menu, event.target);
  moveMenuItemFocus(event, buttons);
}

function moveMenuItemFocus(event, buttons) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !buttons.length) {
    return false;
  }
  event.preventDefault();
  const currentIndex = Math.max(0, buttons.indexOf(document.activeElement));
  let nextIndex = currentIndex;
  if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = buttons.length - 1;
  } else if (event.key === 'ArrowUp') {
    nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
  } else if (event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % buttons.length;
  }
  buttons[nextIndex]?.focus?.();
  return true;
}

function contextMenuNavigationButtons(menu, target) {
  const submenu = target?.closest?.('.context-submenu');
  return directContextMenuButtons(submenu || menu);
}

function directContextMenuButtons(scope) {
  const children = Array.from(scope?.children || []);
  return children.flatMap((child) => {
    if (isEnabledMenuButton(child)) {
      return [child];
    }
    if (child.matches?.('.context-submenu-row')) {
      const button = child.querySelector?.(':scope > button:not([disabled])');
      return button ? [button] : [];
    }
    return [];
  });
}

function isContextSubmenuTrigger(target) {
  return target?.matches?.('.context-submenu-row > button[aria-haspopup="menu"]') === true;
}

function isEnabledMenuButton(target) {
  return target?.tagName === 'BUTTON' && target.disabled !== true;
}

function closeContextMenu(options = {}) {
  const menu = document.getElementById('contextMenu');
  if (!menu || menu.hidden) {
    return;
  }
  menu.hidden = true;
  menu.textContent = '';
  menu.onkeydown = null;
  const trigger = activeContextMenuTrigger;
  activeContextMenuTrigger = null;
  trigger?.setAttribute?.('aria-expanded', 'false');
  if (options.restoreFocus === true && trigger?.isConnected !== false && trigger?.disabled !== true && trigger?.hidden !== true) {
    trigger.focus?.();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    attachTreeContextMenu,
    closeContextMenu,
    showContextMenu
  };
}
