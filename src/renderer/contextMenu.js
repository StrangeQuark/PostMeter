function attachTreeContextMenu(button, items) {
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event.clientX, event.clientY, items);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      showContextMenu(rect.left + 16, rect.bottom + 4, items);
    }
  });
}

function showContextMenu(x, y, items) {
  const menu = document.getElementById('contextMenu');
  menu.textContent = '';
  for (const [label, handler, variant] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.className = variant === 'danger' ? 'danger' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      closeContextMenu();
      handler();
    });
    menu.append(button);
  }
  menu.hidden = false;
  menu.style.left = '0';
  menu.style.top = '0';
  const maxX = window.innerWidth - menu.offsetWidth - 8;
  const maxY = window.innerHeight - menu.offsetHeight - 8;
  menu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
}

function closeContextMenu() {
  const menu = document.getElementById('contextMenu');
  if (!menu || menu.hidden) {
    return;
  }
  menu.hidden = true;
  menu.textContent = '';
}
