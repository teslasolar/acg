/**
 * ACG Docs - Markdown Renderer & Template Engine
 * Renders markdown templates with variable interpolation.
 * Used as the rendering layer for testing output, error reports,
 * API docs, and whiteboard displays.
 *
 * Template syntax:
 *   {{variable}}           - Variable interpolation
 *   {{#each items}}...{{/each}} - Iteration
 *   {{#if cond}}...{{/if}} - Conditionals
 *   {{> partial}}          - Partial includes
 *   {{timestamp}}          - Built-in: current ISO timestamp
 *   {{date}}               - Built-in: current date
 */
import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE_DIR = new URL('./templates/', import.meta.url).pathname;

// ── Template Engine ──────────────────────────────────────────

/**
 * Render a template string with data context.
 */
export function render(template, data = {}) {
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
      return render(body, { ...ctx, ...itemCtx });
    }).join('');
  });

  // {{#if cond}}...{{/if}}
  output = output.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, body) => {
    return ctx[key] ? render(body, ctx) : '';
  });

  // {{> partial}} - include a template file
  output = output.replace(/\{\{>\s*(\w+)\}\}/g, (_, name) => {
    try {
      const partialPath = path.join(TEMPLATE_DIR, `_${name}.md`);
      const partial = fs.readFileSync(partialPath, 'utf-8');
      return render(partial, ctx);
    } catch {
      return `<!-- partial "${name}" not found -->`;
    }
  });

  // {{variable}} - simple interpolation
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

/**
 * Render a template file from the templates directory.
 */
export function renderTemplate(name, data = {}) {
  const filePath = path.join(TEMPLATE_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${name}`);
  }
  const template = fs.readFileSync(filePath, 'utf-8');
  return render(template, data);
}

/**
 * List available templates.
 */
export function listTemplates() {
  try {
    return fs.readdirSync(TEMPLATE_DIR)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .map(f => f.replace('.md', ''));
  } catch {
    return [];
  }
}

// ── Markdown to Console ──────────────────────────────────────

/**
 * Render markdown to styled console output (basic).
 */
export function toConsole(md) {
  let output = md;
  // Headers
  output = output.replace(/^### (.+)$/gm, '\x1b[1m\x1b[36m   $1\x1b[0m');
  output = output.replace(/^## (.+)$/gm, '\x1b[1m\x1b[33m  $1\x1b[0m');
  output = output.replace(/^# (.+)$/gm, '\x1b[1m\x1b[32m$1\x1b[0m\n');
  // Bold
  output = output.replace(/\*\*(.+?)\*\*/g, '\x1b[1m$1\x1b[0m');
  // Inline code
  output = output.replace(/`(.+?)`/g, '\x1b[36m$1\x1b[0m');
  // Bullet lists
  output = output.replace(/^- (.+)$/gm, '  • $1');
  // Horizontal rule
  output = output.replace(/^---$/gm, '─'.repeat(40));
  return output;
}

// ── CLI Runner ───────────────────────────────────────────────

export async function run(args) {
  const [subcommand, ...subArgs] = args;

  switch (subcommand) {
    case 'list':
      console.log('Available templates:');
      for (const t of listTemplates()) console.log(`  ${t}`);
      break;

    case 'render': {
      const name = subArgs[0];
      if (!name) { console.error('Template name required'); return; }
      const data = subArgs[1] ? JSON.parse(subArgs[1]) : {};
      const result = renderTemplate(name, data);
      console.log(toConsole(result));
      break;
    }

    default:
      console.log('ACG Doc Renderer');
      console.log('  list             - List available templates');
      console.log('  render <name>    - Render a template to console');
  }
}

export default run;
