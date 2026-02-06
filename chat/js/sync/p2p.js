/**
 * ACG Chat - P2P Sync via WebRTC/WebTorrent
 * Uses trystero (torrent strategy) for decentralized real-time sync.
 * Peers discover each other via public WebTorrent tracker WebSockets.
 * After signaling, all communication is direct peer-to-peer WebRTC.
 * No server needed.
 */
import { bus } from '../core/events.js';
import { put, get, del, getMessagesByRoom } from '../storage/db.js';

const APP_ID = 'acg-chat-v1';

let _trystero = null;
let _room = null;
let _actions = {};
let _peers = new Set();
let _unsubs = [];
const _p2pIncoming = new Set();

export function getPeerCount() { return _peers.size; }

/**
 * Load trystero from CDN. Gracefully fails if unavailable.
 */
async function loadTrystero() {
  if (_trystero) return _trystero;
  try {
    _trystero = await import('https://esm.sh/trystero/torrent');
    return _trystero;
  } catch {
    try {
      _trystero = await import('https://unpkg.com/trystero/src/torrent.js?module');
      return _trystero;
    } catch (err) {
      console.warn('[P2P] Could not load trystero:', err.message);
      return null;
    }
  }
}

/**
 * Join a P2P swarm for the given room ID.
 * All peers in the same room discover each other via WebTorrent trackers
 * and exchange messages over WebRTC data channels.
 */
export async function joinP2PRoom(roomId) {
  leaveP2PRoom();

  const trystero = await loadTrystero();
  if (!trystero) {
    bus.emit('p2p:unavailable');
    return;
  }

  const { joinRoom } = trystero;

  _room = joinRoom({ appId: APP_ID }, roomId);

  // Define P2P actions (each creates a send/receive pair over data channels)
  const [sendMsg, getMsg] = _room.makeAction('msg');
  const [sendEdit, getEdit] = _room.makeAction('edit');
  const [sendDel, getDel] = _room.makeAction('del');
  const [sendReact, getReact] = _room.makeAction('react');
  const [sendHist, getHist] = _room.makeAction('hist');

  _actions = { sendMsg, sendEdit, sendDel, sendReact, sendHist };

  // --- Incoming message handlers ---

  getMsg(async (data) => {
    if (!data || !data.id) return;
    _p2pIncoming.add(data.id);
    const existing = await get('messages', data.id);
    if (!existing) {
      await put('messages', data);
      bus.emit('message:new', data);
    }
    setTimeout(() => _p2pIncoming.delete(data.id), 1000);
  });

  getEdit(async (data) => {
    if (!data || !data.id) return;
    _p2pIncoming.add(data.id);
    const existing = await get('messages', data.id);
    if (existing) {
      await put('messages', data);
      bus.emit('message:edited', data);
    }
    setTimeout(() => _p2pIncoming.delete(data.id), 1000);
  });

  getDel(async (data) => {
    if (!data || !data.id) return;
    _p2pIncoming.add(data.id);
    await del('messages', data.id);
    bus.emit('message:deleted', data);
    setTimeout(() => _p2pIncoming.delete(data.id), 1000);
  });

  getReact(async (data) => {
    if (!data || !data.id) return;
    _p2pIncoming.add(data.id);
    await put('messages', data);
    bus.emit('message:reaction', data);
    setTimeout(() => _p2pIncoming.delete(data.id), 1000);
  });

  // History exchange: when a new peer joins, existing peers send recent messages
  getHist(async (messages) => {
    if (!Array.isArray(messages)) return;
    let newCount = 0;
    for (const msg of messages) {
      if (!msg || !msg.id) continue;
      const existing = await get('messages', msg.id);
      if (!existing) {
        await put('messages', msg);
        newCount++;
      }
    }
    if (newCount > 0) {
      bus.emit('p2p:history-received', { count: newCount });
    }
  });

  // --- Peer lifecycle ---

  _room.onPeerJoin(async (peerId) => {
    _peers.add(peerId);
    bus.emit('p2p:peers-changed', _peers.size);

    // Send recent history to the newly connected peer
    try {
      const messages = await getMessagesByRoom(roomId, 50);
      if (messages.length > 0) {
        sendHist(messages, [peerId]);
      }
    } catch (err) {
      console.warn('[P2P] Failed to send history:', err.message);
    }
  });

  _room.onPeerLeave((peerId) => {
    _peers.delete(peerId);
    bus.emit('p2p:peers-changed', _peers.size);
  });

  // --- Outbound: wire local events to P2P broadcast ---

  // message:sent only fires from local user action (sendMessage in message.js)
  _unsubs.push(bus.on('message:sent', (msg) => {
    if (_actions.sendMsg && msg) _actions.sendMsg(msg);
  }));

  // For edit/delete/reaction, skip if this event originated from P2P
  _unsubs.push(bus.on('message:edited', (msg) => {
    if (msg && !_p2pIncoming.has(msg.id) && _actions.sendEdit) {
      _actions.sendEdit(msg);
    }
  }));

  _unsubs.push(bus.on('message:deleted', (data) => {
    if (data && !_p2pIncoming.has(data.id) && _actions.sendDel) {
      _actions.sendDel(data);
    }
  }));

  _unsubs.push(bus.on('message:reaction', (msg) => {
    if (msg && !_p2pIncoming.has(msg.id) && _actions.sendReact) {
      _actions.sendReact(msg);
    }
  }));

  bus.emit('p2p:joined', roomId);
}

export function leaveP2PRoom() {
  for (const unsub of _unsubs) unsub();
  _unsubs = [];

  if (_room) {
    _room.leave();
    _room = null;
  }

  _actions = {};
  _peers.clear();
  _p2pIncoming.clear();
}
