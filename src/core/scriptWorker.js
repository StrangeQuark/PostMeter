const { runPostmanScript } = require('./scriptRuntime');

process.on('message', (message = {}) => {
  try {
    const context = message.context || {};
    const result = runPostmanScript(message.scriptText || '', context, message.options || {});
    process.send?.({
      ok: true,
      result,
      environmentVariables: context.environment?.variables || [],
      collectionVariables: context.collectionVariables || [],
      localVariables: context.localVariables || []
    });
  } catch (error) {
    process.send?.({
      ok: false,
      error: error.message || String(error),
      environmentVariables: message.context?.environment?.variables || [],
      collectionVariables: message.context?.collectionVariables || [],
      localVariables: message.context?.localVariables || []
    });
  }
});
