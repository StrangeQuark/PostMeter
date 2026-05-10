(function attachUiSmokeCommon(global) {
  function queueUiSmokeRun(options = {}) {
    const runtimeGlobal = options.runtimeGlobal || global;
    const params = options.params || new URLSearchParams(runtimeGlobal.location?.search || '');
    if (params.get(options.flag) !== '1') {
      return false;
    }
    setUiSmokeState(runtimeGlobal, options.flag, 'queued');
    const schedule = runtimeGlobal.setTimeout || setTimeout;
    schedule(() => {
      setUiSmokeState(runtimeGlobal, options.flag, 'running');
      Promise.resolve()
        .then(() => options.run(params))
        .then(() => {
          setUiSmokeState(runtimeGlobal, options.flag, 'passed');
          runtimeGlobal.document.title = `${options.titlePrefix}:PASS`;
        })
        .catch((error) => {
          setUiSmokeState(runtimeGlobal, options.flag, `failed:${smokeFailureText(error)}`);
          runtimeGlobal.document.title = `${options.titlePrefix}:FAIL:${smokeFailureText(error)}`;
        });
    }, options.delayMillis ?? 50);
    return true;
  }

  function setUiSmokeState(runtimeGlobal, flag, state) {
    const doc = runtimeGlobal.document;
    if (!doc?.documentElement) {
      return;
    }
    doc.documentElement.dataset[flag] = String(state || '');
  }

  function smokeFailureText(error) {
    const primary = String(error?.message || error || 'UI smoke failed.');
    const stackLine = String(error?.stack || '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && line !== primary && !line.endsWith(primary) && !line.startsWith('TypeError:') && !line.startsWith('Error:'));
    return stackLine ? `${primary} @ ${stackLine}`.slice(0, 160) : primary.slice(0, 160);
  }

  function waitForUiSmoke(predicate, message, timeoutMillis = 3000, runtimeGlobal = global) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        try {
          if (predicate()) {
            resolve();
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }
        if (Date.now() - start > timeoutMillis) {
          reject(new Error(message));
          return;
        }
        (runtimeGlobal.setTimeout || setTimeout)(check, 25);
      };
      check();
    });
  }

  async function captureUiSnapshotState(label, setup, runtimeGlobal = global) {
    setup();
    await nextPaint(runtimeGlobal);
    await new Promise((resolve) => {
      runtimeGlobal.__postmeterSnapshotContinue = () => {
        runtimeGlobal.__postmeterSnapshotContinue = null;
        resolve();
      };
      runtimeGlobal.document.title = `PostMeter UI Snapshot:CAPTURE:${label}`;
    });
  }

  function nextPaint(runtimeGlobal = global) {
    return new Promise((resolve) => {
      runtimeGlobal.requestAnimationFrame(() => runtimeGlobal.requestAnimationFrame(resolve));
    });
  }

  function dispatchInput(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function dispatchChange(element) {
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function assertUiSmoke(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function setPairRow(tableId, key, value, runtimeGlobal = global) {
    const row = getElement(runtimeGlobal, tableId).querySelector('.kv-row:last-child');
    assertUiSmoke(row, `Missing row in ${tableId}.`);
    const inputs = row.querySelectorAll('input');
    inputs[1].value = key;
    dispatchInput(inputs[1]);
    inputs[2].value = value;
    dispatchInput(inputs[2]);
  }

  function setAssertionRow(type, name, path, operator, expected, runtimeGlobal = global) {
    const row = getElement(runtimeGlobal, 'assertionsTable').querySelector('.assertion-row:last-child');
    assertUiSmoke(row, 'Missing assertion row.');
    const selects = row.querySelectorAll('select');
    const inputs = row.querySelectorAll('input');
    selects[0].value = type;
    dispatchChange(selects[0]);
    inputs[1].value = name;
    dispatchInput(inputs[1]);
    inputs[2].value = path;
    dispatchInput(inputs[2]);
    selects[1].value = operator;
    dispatchChange(selects[1]);
    inputs[3].value = expected;
    dispatchInput(inputs[3]);
  }

  function assertContextMenuSmoke(options = {}, runtimeGlobal = global) {
    const collectionButton = runtimeGlobal.document.querySelector('.collection-node > .tree-item');
    assertUiSmoke(collectionButton, 'Collection tree item was not rendered.');
    collectionButton.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 80
    }));
    const contextMenu = getElement(runtimeGlobal, 'contextMenu');
    const topLevelButtons = getContextMenuTopLevelButtons(contextMenu);
    const labels = topLevelButtons.map((button) => button.textContent);
    const submenuLabels = Array.from(contextMenu.querySelectorAll('.context-submenu button')).map((button) => button.textContent);
    assertUiSmoke(!contextMenu.hidden, 'Context menu did not open.');
    for (const label of ['Add Request', 'Add Folder', 'Rename', 'Duplicate', 'Export', 'Delete']) {
      assertUiSmoke(labels.includes(label), `Context menu missing ${label}.`);
    }
    for (const label of ['PostMeter', 'Postman', 'OpenAPI', 'curl']) {
      assertUiSmoke(submenuLabels.includes(label), `Context menu export submenu missing ${label}.`);
    }
    if (options.keyboard === true) {
      runtimeGlobal.closeContextMenu();
      collectionButton.focus();
      collectionButton.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'F10',
        shiftKey: true
      }));
      assertUiSmoke(!contextMenu.hidden, 'Keyboard context menu did not open.');
      const buttons = getContextMenuTopLevelButtons(contextMenu);
      assertUiSmoke(runtimeGlobal.document.activeElement === buttons[0], 'Keyboard context menu should focus the first action.');
      buttons[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
      assertUiSmoke(runtimeGlobal.document.activeElement === buttons[1], 'Keyboard context menu should support arrow navigation.');
      buttons[1].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'End' }));
      assertUiSmoke(runtimeGlobal.document.activeElement === buttons.at(-1), 'Keyboard context menu should support End navigation.');
      const exportButton = buttons.find((button) => button.textContent === 'Export');
      assertUiSmoke(exportButton, 'Keyboard context menu should expose the export submenu trigger.');
      exportButton.focus();
      exportButton.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }));
      const exportSubmenuButton = exportButton.parentElement?.querySelector?.('.context-submenu button:not([disabled])');
      assertUiSmoke(runtimeGlobal.document.activeElement === exportSubmenuButton, 'Keyboard context menu should move into export submenu items with ArrowRight.');
      exportSubmenuButton.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowLeft' }));
      assertUiSmoke(runtimeGlobal.document.activeElement === exportButton, 'Keyboard context menu should return from export submenu items with ArrowLeft.');
      buttons.at(-1).focus();
      buttons.at(-1).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }));
      assertUiSmoke(runtimeGlobal.document.activeElement === buttons.at(-2), 'Keyboard context menu should navigate relative to the focused menu item.');
      buttons.at(-2).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
      assertUiSmoke(contextMenu.hidden, 'Escape should close the keyboard context menu.');
      assertUiSmoke(runtimeGlobal.document.activeElement === collectionButton, 'Escape should restore focus to the context menu trigger.');
    }
    if (!options.keepOpen) {
      runtimeGlobal.closeContextMenu();
    }
  }

  function getContextMenuTopLevelButtons(contextMenu) {
    return Array.from(contextMenu.children).flatMap((child) => {
      if (child.matches?.('button')) {
        return [child];
      }
      if (child.matches?.('.context-submenu-row')) {
        const parentButton = child.querySelector(':scope > button');
        return parentButton ? [parentButton] : [];
      }
      return [];
    });
  }

  function getElement(runtimeGlobal, id) {
    if (typeof runtimeGlobal.$ === 'function') {
      return runtimeGlobal.$(id);
    }
    return runtimeGlobal.document.getElementById(id);
  }

  const exported = {
    assertContextMenuSmoke,
    assertUiSmoke,
    captureUiSnapshotState,
    dispatchChange,
    dispatchInput,
    nextPaint,
    queueUiSmokeRun,
    setAssertionRow,
    setPairRow,
    waitForUiSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiSmokeCommon = exported;
})(typeof window === 'undefined' ? globalThis : window);
