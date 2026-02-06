/**
 * ACG Chat - WebRTC P2P (Optional)
 * Real-time peer-to-peer messaging.
 * Signaling via localStorage or manual exchange.
 */
import { bus } from '../core/events.js';

let _connections = new Map();
let _dataChannels = new Map();

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function isSupported() {
  return typeof RTCPeerConnection !== 'undefined';
}

export async function createOffer(peerId) {
  if (!isSupported()) return null;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  _connections.set(peerId, pc);

  const dc = pc.createDataChannel('acg-chat');
  setupDataChannel(dc, peerId);

  pc.onicecandidate = (e) => {
    if (e.candidate === null) {
      bus.emit('rtc:offer-ready', {
        peerId,
        offer: pc.localDescription,
      });
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function acceptOffer(peerId, offer) {
  if (!isSupported()) return null;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  _connections.set(peerId, pc);

  pc.ondatachannel = (e) => {
    setupDataChannel(e.channel, peerId);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate === null) {
      bus.emit('rtc:answer-ready', {
        peerId,
        answer: pc.localDescription,
      });
    }
  };

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function completeConnection(peerId, answer) {
  const pc = _connections.get(peerId);
  if (!pc) return;
  await pc.setRemoteDescription(answer);
}

function setupDataChannel(dc, peerId) {
  _dataChannels.set(peerId, dc);

  dc.onopen = () => bus.emit('rtc:connected', peerId);
  dc.onclose = () => {
    _dataChannels.delete(peerId);
    bus.emit('rtc:disconnected', peerId);
  };

  dc.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      bus.emit('sync:received', data);
      if (data.type) bus.emit(data.type, data.payload);
    } catch {
      // ignore malformed
    }
  };
}

export function sendToPeer(peerId, data) {
  const dc = _dataChannels.get(peerId);
  if (dc && dc.readyState === 'open') {
    dc.send(JSON.stringify(data));
    return true;
  }
  return false;
}

export function broadcastToPeers(data) {
  const json = JSON.stringify(data);
  for (const [, dc] of _dataChannels) {
    if (dc.readyState === 'open') {
      dc.send(json);
    }
  }
}

export function disconnect(peerId) {
  const pc = _connections.get(peerId);
  if (pc) pc.close();
  _connections.delete(peerId);
  _dataChannels.delete(peerId);
}

export function disconnectAll() {
  for (const [id] of _connections) disconnect(id);
}

export function getPeerCount() {
  let count = 0;
  for (const [, dc] of _dataChannels) {
    if (dc.readyState === 'open') count++;
  }
  return count;
}
