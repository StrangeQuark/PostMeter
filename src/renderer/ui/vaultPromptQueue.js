(function attachVaultPromptQueue(global) {
  function createVaultPromptQueue(options = {}) {
    const onPrompt = typeof options.onPrompt === 'function'
      ? options.onPrompt
      : async () => ({ granted: false, scope: 'request' });
    let tail = Promise.resolve();

    function enqueue(payload = {}) {
      const run = tail
        .catch(() => {})
        .then(() => onPrompt(payload));
      tail = run.catch(() => {});
      return run;
    }

    return { enqueue };
  }

  const exported = { createVaultPromptQueue };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterVaultPromptQueue = exported;
})(typeof window === 'undefined' ? globalThis : window);
