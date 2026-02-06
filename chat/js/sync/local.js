/**
 * ACG Chat - LocalStorage Sync
 * Cross-tab synchronization via storage events.
 */
import { bus } from '../core/events.js';

const SYNC_KEY = 'acg-chat-sync';
let _listening = false;

function handleStorageEvent(e) {
  if (e.key !== SYNC_KEY || !e.newValue) return;
  try {
    const data = JSON.parse(e.newValue);
    bus.emit('sync:received', data);
    if (data.type === 'message:new') bus.emit('message:new', data.payload);
    if (data.type === 'message:edited') bus.emit('message:edited', data.payload);
    if (data.type === 'message:deleted') bus.emit('message:deleted', data.payload);
    if (data.type === 'message:reaction') bus.emit('message:reaction', data.payload);
  } catch {
    // ignore malformed sync data
  }
}

export function startLocalSync() {
  if (_listening) return;
  _listening = true;
  window.addEventListener('storage', handleStorageEvent);

  const events = ['message:new', 'message:edited', 'message:deleted', 'message:reaction'];
  for (const evt of events) {
    bus.on(evt, (payload) => {
      broadcastLocal({ type: evt, payload, source: 'local' });
    });
  }
}

export function stopLocalSync() {
  _listening = false;
  window.removeEventListener('storage', handleStorageEvent);
}

export function broadcastLocal(data) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({
      ...data,
      _ts: Date.now(),
    }));
  } catch {
    // storage full or unavailable
  }
}
