/**
 * ACG Chat - Message Format & Operations
 * Handles message creation, editing, deletion, and reactions.
 */
import { generateUUID } from '../core/crypto.js';
import { signMessage } from '../core/crypto.js';
import { put, get, del } from '../storage/db.js';
import { bus } from '../core/events.js';
import { getState } from '../core/state.js';

export function createMessage(opts) {
  const user = getState().currentUser;
  if (!user) throw new Error('No user identity');

  return {
    id: generateUUID(),
    room: opts.room,
    channel: opts.channel || 'NEU',
    user: {
      id: user.id,
      name: user.name,
      color: user.color,
    },
    content: opts.content,
    timestamp: Date.now(),
    replyTo: opts.replyTo || null,
    reactions: {},
    edited: false,
    aiAssisted: opts.aiAssisted || false,
    signature: null,
  };
}

export async function sendMessage(opts) {
  const msg = createMessage(opts);

  const user = getState().currentUser;
  if (user && user.privateKey) {
    msg.signature = await signMessage(msg.content, user.privateKey);
  }

  await put('messages', msg);
  bus.emit('message:sent', msg);
  bus.emit('message:new', msg);
  return msg;
}

export async function editMessage(messageId, newContent) {
  const msg = await get('messages', messageId);
  if (!msg) return null;

  const user = getState().currentUser;
  if (!user || msg.user.id !== user.id) return null;

  msg.content = newContent;
  msg.edited = true;
  msg.editedAt = Date.now();

  if (user.privateKey) {
    msg.signature = await signMessage(msg.content, user.privateKey);
  }

  await put('messages', msg);
  bus.emit('message:edited', msg);
  return msg;
}

export async function deleteMessage(messageId) {
  const msg = await get('messages', messageId);
  if (!msg) return false;

  const user = getState().currentUser;
  if (!user || msg.user.id !== user.id) return false;

  await del('messages', messageId);
  bus.emit('message:deleted', { id: messageId, room: msg.room, channel: msg.channel });
  return true;
}

export async function addReaction(messageId, emoji) {
  const msg = await get('messages', messageId);
  if (!msg) return null;

  const user = getState().currentUser;
  if (!user) return null;

  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  const idx = msg.reactions[emoji].indexOf(user.id);
  if (idx >= 0) {
    msg.reactions[emoji].splice(idx, 1);
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
  } else {
    msg.reactions[emoji].push(user.id);
  }

  await put('messages', msg);
  bus.emit('message:reaction', msg);
  return msg;
}

export function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (d.toDateString() === new Date(now - 86400000).toDateString()) {
    return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function sanitizeContent(content) {
  const div = document.createElement('div');
  div.textContent = content;
  return div.innerHTML;
}
