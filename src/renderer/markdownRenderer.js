(function attachMarkdownRenderer(global) {
  let markdownItInstance = null;

  function markdownItFactory() {
    if (typeof global.markdownit === 'function') {
      return global.markdownit;
    }
    if (typeof require === 'function') {
      return require('markdown-it');
    }
    return null;
  }

  function markdownIt() {
    if (markdownItInstance) {
      return markdownItInstance;
    }
    const factory = markdownItFactory();
    if (!factory) {
      return null;
    }
    markdownItInstance = factory({
      breaks: false,
      html: false,
      linkify: true,
      typographer: false
    });
    const defaultLinkOpen = markdownItInstance.renderer.rules.link_open
      || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
    markdownItInstance.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      setMarkdownTokenAttr(tokens[idx], 'rel', 'noreferrer');
      return defaultLinkOpen(tokens, idx, options, env, self);
    };
    return markdownItInstance;
  }

  function renderMarkdown(value) {
    const source = String(value || '');
    const renderer = markdownIt();
    if (!renderer) {
      return fallbackRenderMarkdown(source);
    }
    return renderer.render(source);
  }

  function setMarkdownTokenAttr(token, name, value) {
    const index = token.attrIndex(name);
    if (index < 0) {
      token.attrPush([name, value]);
      return;
    }
    token.attrs[index][1] = value;
  }

  function fallbackRenderMarkdown(value) {
    return String(value || '')
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>\n')}</p>`)
      .join('\n');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const exported = {
    renderMarkdown
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterMarkdownRenderer = exported;
})(typeof window === 'undefined' ? globalThis : window);
