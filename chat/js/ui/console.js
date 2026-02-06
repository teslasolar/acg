/**
 * ACG Chat - Console & Error Reporting Panel
 * In-app console for viewing logs, errors, and system status.
 * Errors can be reported to the API/MCP layer.
 */
import { bus } from '../core/events.js';

const MAX_ENTRIES = 500;
let _entries = [];
let _visible = false;

export function initConsole() {
  const panel = document.getElementById('console-panel');
  const toggle = document.getElementById('console-toggle');
  const clearBtn = document.getElementById('console-clear');
  const output = document.getElementById('console-output');
  const exportBtn = document.getElementById('console-export');

  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    _visible = !_visible;
    panel.classList.toggle('open', _visible);
    if (_visible) renderEntries(output);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _entries = [];
      if (output) output.innerHTML = '';
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = JSON.stringify({
        exported: new Date().toISOString(),
        entries: _entries,
      }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acg-console-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Capture global errors
  window.addEventListener('error', (e) => {
    log('error', e.message, { file: e.filename, line: e.lineno, col: e.colno });
  });

  window.addEventListener('unhandledrejection', (e) => {
    log('error', `Unhandled: ${e.reason?.message || e.reason}`, { type: 'promise' });
  });

  // Listen to bus events for system logging
  bus.on('ai:error', (msg) => log('error', `[AI] ${msg}`));
  bus.on('ai:ready', () => log('info', '[AI] Model loaded'));
  bus.on('ai:loading', ({ text }) => log('debug', `[AI] ${text}`));
  bus.on('p2p:peers-changed', (count) => log('info', `[P2P] ${count} peer(s) connected`));
  bus.on('sync:polled', ({ newMessages }) => log('debug', `[Sync] Polled ${newMessages} new messages`));
  bus.on('message:sent', (msg) => log('debug', `[Chat] Sent: ${msg.content.slice(0, 50)}`));
  bus.on('room:joined', (room) => log('info', `[Room] Joined: ${room.name || room.id}`));
}

export function log(level, message, meta = {}) {
  const entry = {
    timestamp: Date.now(),
    level,
    message,
    meta,
  };

  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();

  if (_visible) {
    const output = document.getElementById('console-output');
    if (output) appendEntry(output, entry);
  }

  // Also log to browser console
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[ACG ${level.toUpperCase()}]`, message, Object.keys(meta).length ? meta : '');
}

function appendEntry(container, entry) {
  const div = document.createElement('div');
  div.className = `console-entry console-${entry.level}`;
  const time = new Date(entry.timestamp).toLocaleTimeString();
  div.innerHTML = `<span class="console-time">${time}</span> <span class="console-level">${entry.level}</span> ${escapeHtml(entry.message)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderEntries(container) {
  if (!container) return;
  container.innerHTML = '';
  for (const entry of _entries) {
    appendEntry(container, entry);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function getEntries(level) {
  if (!level) return _entries;
  return _entries.filter(e => e.level === level);
}

export function getErrors() {
  return getEntries('error');
}
