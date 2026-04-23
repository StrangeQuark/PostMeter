(function attachUiSmokeCommon(global) {
  function queueUiSmokeRun(options = {}) {
    const runtimeGlobal = options.runtimeGlobal || global;
    const params = options.params || new URLSearchParams(runtimeGlobal.location?.search || '');
    if (params.get(options.flag) !== '1') {
      return false;
    }
    const schedule = runtimeGlobal.setTimeout || setTimeout;
    schedule(() => {
      Promise.resolve()
        .then(() => options.run(params))
        .then(() => {
          runtimeGlobal.document.title = `${options.titlePrefix}:PASS`;
        })
        .catch((error) => {
          runtimeGlobal.document.title = `${options.titlePrefix}:FAIL:${String(error?.message || error).slice(0, 160)}`;
        });
    }, options.delayMillis ?? 50);
    return true;
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
    const labels = Array.from(contextMenu.querySelectorAll('button')).map((button) => button.textContent);
    assertUiSmoke(!contextMenu.hidden, 'Context menu did not open.');
    for (const label of ['Add Request', 'Add Folder', 'Rename', 'Export', 'Delete']) {
      assertUiSmoke(labels.includes(label), `Context menu missing ${label}.`);
    }
    if (!options.keepOpen) {
      runtimeGlobal.closeContextMenu();
    }
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
