/**
 * ACG Chat - Markdown Rendering Screen
 * In-browser markdown renderer for templates, docs, and reports.
 * Renders markdown to HTML for display in the chat UI.
 */

/**
 * Convert markdown string to HTML (lightweight, no dependencies).
 */
export function markdownToHtml(md) {
  let html = md;

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-code"><code class="lang-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="md-hr">');

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(Boolean).map(c => c.trim());
    if (cells.every(c => /^-+$/.test(c))) return ''; // separator row
    const tag = 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => {
    if (!match.includes('<table>')) return `<table class="md-table">${match}</table>`;
    return match;
  });

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => `<ul class="md-list">${match}</ul>`);
  // Clean nested ul
  html = html.replace(/<\/ul>\s*<ul class="md-list">/g, '');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>');

  // Paragraphs (lines not already wrapped)
  html = html.replace(/^(?!<[hupoltd]|<hr|<pre|<code|<li|<tr|<table)(.+)$/gm, '<p>$1</p>');

  // Clean empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

/**
 * Render markdown into a DOM container.
 */
export function renderMarkdown(container, md) {
  container.innerHTML = markdownToHtml(md);
}

/**
 * Simple template interpolation (browser-side version of docs/renderer.js).
 */
export function renderBrowserTemplate(template, data = {}) {
  const ctx = {
    ...data,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
  };

  let output = template;

  // {{#each items}}...{{/each}}
  output = output.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, body) => {
    const arr = ctx[key];
    if (!Array.isArray(arr)) return '';
    return arr.map((item, index) => {
      const itemCtx = typeof item === 'object' ? { ...item, _index: index } : { _value: item, _index: index };
      return renderBrowserTemplate(body, { ...ctx, ...itemCtx });
    }).join('');
  });

  // {{#if cond}}...{{/if}}
  output = output.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, body) => {
    return ctx[key] ? renderBrowserTemplate(body, ctx) : '';
  });

  // {{variable}}
  output = output.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, keyPath) => {
    const keys = keyPath.split('.');
    let val = ctx;
    for (const k of keys) {
      if (val == null) return '';
      val = val[k];
    }
    return val != null ? String(val) : '';
  });

  return output;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
