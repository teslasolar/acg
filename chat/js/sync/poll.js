/**
 * ACG Chat - GitHub Raw File Polling
 * Cross-user sync by polling static JSON files on GitHub Pages.
 */
import { bus } from '../core/events.js';
import { put, get } from '../storage/db.js';

let _interval = null;
let _baseUrl = '';
const POLL_INTERVAL = 30000;
const RATE_LIMIT_WINDOW = 5000;
let _lastPoll = 0;

export function setBaseUrl(url) {
  _baseUrl = url.replace(/\/$/, '');
}

export function detectBaseUrl() {
  const loc = window.location;
  if (loc.hostname.includes('github.io')) {
    _baseUrl = loc.origin + loc.pathname.replace(/\/[^/]*$/, '');
  } else {
    _baseUrl = loc.origin + loc.pathname.replace(/\/[^/]*$/, '');
  }
}

async function fetchJSON(path) {
  const url = `${_baseUrl}/${path}?_=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function pollMessages() {
  const now = Date.now();
  if (now - _lastPoll < RATE_LIMIT_WINDOW) return;
  _lastPoll = now;

  const data = await fetchJSON('data/messages/latest.json');
  if (!data || !Array.isArray(data)) return;

  const lastSync = await get('sync', 'last-poll-ts');
  const lastTs = lastSync ? lastSync.value : 0;

  let newCount = 0;
  for (const msg of data) {
    if (msg.timestamp > lastTs) {
      const existing = await get('messages', msg.id);
      if (!existing) {
        await put('messages', msg);
        bus.emit('message:new', msg);
        newCount++;
      }
    }
  }

  await put('sync', { key: 'last-poll-ts', value: Date.now() });

  if (newCount > 0) {
    bus.emit('sync:polled', { newMessages: newCount });
  }
}

export async function pollRooms() {
  const data = await fetchJSON('data/rooms/index.json');
  if (!data || !Array.isArray(data)) return;

  for (const room of data) {
    await put('rooms', room);
  }
  bus.emit('sync:rooms-updated', data);
}

export function startPolling() {
  if (_interval) return;
  detectBaseUrl();
  pollMessages();
  pollRooms();
  _interval = setInterval(() => {
    pollMessages();
  }, POLL_INTERVAL);
}

export function stopPolling() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
