/**
 * ACG Chat - State Management
 * Reactive state container with change notifications via EventBus.
 */
import { bus } from './events.js';

const _state = {
  currentUser: null,
  currentRoom: null,
  currentChannel: 'NEU',
  rooms: [],
  messages: [],
  users: new Map(),
  online: navigator.onLine,
  pendingQueue: [],
};

const STATE_CHANGE = 'state:change';

export function getState() {
  return _state;
}

export function setState(partial) {
  const prev = { ..._state };
  Object.assign(_state, partial);
  bus.emit(STATE_CHANGE, _state, prev);
}

export function onStateChange(fn) {
  return bus.on(STATE_CHANGE, fn);
}

window.addEventListener('online', () => setState({ online: true }));
window.addEventListener('offline', () => setState({ online: false }));
