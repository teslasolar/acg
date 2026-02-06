/**
 * ACG Chat - BroadcastChannel Sync
 * Same-origin tab synchronization (instant).
 */
import { bus } from '../core/events.js';

const CHANNEL_NAME = 'acg-chat';
let _bc = null;

export function startBroadcastSync() {
  if (_bc) return;
  if (typeof BroadcastChannel === 'undefined') return;

  _bc = new BroadcastChannel(CHANNEL_NAME);

  _bc.onmessage = (e) => {
    const data = e.data;
    if (!data || !data.type) return;
    bus.emit('sync:received', data);
    bus.emit(data.type, data.payload);
  };

  const events = ['message:new', 'message:edited', 'message:deleted', 'message:reaction'];
  for (const evt of events) {
    bus.on(evt, (payload) => {
      if (_bc) {
        _bc.postMessage({ type: evt, payload, source: 'broadcast' });
      }
    });
  }
}

export function stopBroadcastSync() {
  if (_bc) {
    _bc.close();
    _bc = null;
  }
}

export function broadcastMessage(data) {
  if (_bc) {
    _bc.postMessage(data);
  }
}
