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
  for (const [label, handler, variant] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.className = variant === 'danger' ? 'danger' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      closeContextMenu({ restoreFocus: keyboardContextMenuActivation === true });
      handler();
    });
    menu.append(button);
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

function handleContextMenuKeydown(event) {
  const menu = document.getElementById('contextMenu');
  const buttons = Array.from(menu?.querySelectorAll('button:not([disabled])') || []);
  if (event.key === 'Escape') {
    event.preventDefault();
    closeContextMenu({ restoreFocus: true });
    return;
  }
  if (event.key === 'Tab') {
    closeContextMenu();
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('button')) {
    event.preventDefault();
    keyboardContextMenuActivation = true;
    try {
      event.target.click();
    } finally {
      keyboardContextMenuActivation = false;
    }
    return;
  }
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
