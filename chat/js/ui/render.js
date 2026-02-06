/**
 * ACG Chat - DOM Rendering
 * Renders rooms, channels, messages, and user interface.
 */
import { getState, onStateChange } from '../core/state.js';
import { bus } from '../core/events.js';
import { CHANNELS, CHANNEL_KEYS, getChannelName, switchChannel, joinRoom } from '../chat/room.js';
import { formatTimestamp, sanitizeContent, deleteMessage, addReaction, editMessage } from '../chat/message.js';
import { getMessagesByRoomChannel } from '../storage/db.js';
import { isBlocked } from '../chat/user.js';
// Thread utilities available: buildThreadTree, flattenThread from '../chat/thread.js'

const REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];

let _replyTo = null;
let _editingId = null;

export function getReplyTo() { return _replyTo; }
export function setReplyTo(id) { _replyTo = id; }
export function getEditingId() { return _editingId; }
export function setEditingId(id) { _editingId = id; }

export function initRenderer() {
  onStateChange(() => renderAll());
  bus.on('message:new', () => refreshMessages());
  bus.on('message:edited', () => refreshMessages());
  bus.on('message:deleted', () => refreshMessages());
  bus.on('message:reaction', () => refreshMessages());
  bus.on('room:channel-changed', () => refreshMessages());
  bus.on('room:joined', () => renderAll());
}

export function renderAll() {
  renderRoomList();
  renderChannelList();
  renderHeader();
  refreshMessages();
}

function renderRoomList() {
  const el = document.getElementById('room-list');
  if (!el) return;

  const state = getState();
  const rooms = state.rooms || [];

  el.innerHTML = '';
  for (const room of rooms) {
    const item = document.createElement('div');
    item.className = 'room-item' + (state.currentRoom && state.currentRoom.id === room.id ? ' active' : '');
    item.textContent = room.name;
    item.onclick = () => joinRoom(room.id);
    el.appendChild(item);
  }
}

function renderChannelList() {
  const el = document.getElementById('channel-list');
  if (!el) return;

  const state = getState();
  el.innerHTML = '';

  for (const key of CHANNEL_KEYS) {
    const item = document.createElement('div');
    item.className = 'channel-item' + (state.currentChannel === key ? ' active' : '');
    item.innerHTML = `<span class="channel-hash">#</span>${getChannelName(key)}`;
    item.onclick = () => switchChannel(key);
    el.appendChild(item);
  }
}

function renderHeader() {
  const el = document.getElementById('channel-header');
  if (!el) return;

  const state = getState();
  if (!state.currentRoom) {
    el.textContent = 'Select a room to start chatting';
    return;
  }
  el.innerHTML = `<span class="channel-hash">#</span>${getChannelName(state.currentChannel)}`;
}

export async function refreshMessages() {
  const el = document.getElementById('message-list');
  if (!el) return;

  const state = getState();
  if (!state.currentRoom) {
    el.innerHTML = '<div class="empty-state">Join or create a room to start chatting.</div>';
    return;
  }

  const messages = await getMessagesByRoomChannel(
    state.currentRoom.id,
    state.currentChannel,
    200
  );

  const user = state.currentUser;
  el.innerHTML = '';

  if (messages.length === 0) {
    el.innerHTML = `<div class="empty-state">No messages in #${getChannelName(state.currentChannel)} yet. Be the first!</div>`;
    return;
  }

  for (const msg of messages) {
    if (user && isBlocked(user, msg.user.id)) continue;
    el.appendChild(renderMessage(msg, user));
  }

  el.scrollTop = el.scrollHeight;
}

function renderMessage(msg, currentUser) {
  const div = document.createElement('div');
  div.className = 'message' + (msg.aiAssisted ? ' ai-assisted' : '');
  div.dataset.id = msg.id;

  if (msg.replyTo) {
    div.classList.add('reply');
  }

  const isOwn = currentUser && msg.user.id === currentUser.id;

  div.innerHTML = `
    <div class="message-header">
      <span class="message-author" style="color: ${sanitizeContent(msg.user.color)}">${sanitizeContent(msg.user.name)}</span>
      <span class="message-time">${formatTimestamp(msg.timestamp)}</span>
      ${msg.edited ? '<span class="message-edited">(edited)</span>' : ''}
      ${msg.aiAssisted ? '<span class="ai-badge">AI-Assisted</span>' : ''}
    </div>
    ${msg.replyTo ? '<div class="reply-indicator">Replying to a message</div>' : ''}
    <div class="message-content">${sanitizeContent(msg.content)}</div>
    <div class="message-reactions">${renderReactions(msg)}</div>
    <div class="message-actions">
      <button class="action-btn react-btn" title="React">+</button>
      <button class="action-btn reply-btn" title="Reply">Reply</button>
      ${isOwn ? '<button class="action-btn edit-btn" title="Edit">Edit</button>' : ''}
      ${isOwn ? '<button class="action-btn delete-btn" title="Delete">Delete</button>' : ''}
    </div>
  `;

  // Reaction button
  div.querySelector('.react-btn').onclick = (e) => {
    e.stopPropagation();
    showReactionPicker(msg.id, e.target);
  };

  // Reply button
  div.querySelector('.reply-btn').onclick = () => {
    _replyTo = msg.id;
    const indicator = document.getElementById('reply-indicator');
    if (indicator) {
      indicator.textContent = `Replying to ${msg.user.name}`;
      indicator.classList.add('visible');
    }
    document.getElementById('message-input')?.focus();
  };

  // Edit button (own messages)
  const editBtn = div.querySelector('.edit-btn');
  if (editBtn) {
    editBtn.onclick = () => {
      _editingId = msg.id;
      const input = document.getElementById('message-input');
      if (input) {
        input.value = msg.content;
        input.focus();
      }
      const indicator = document.getElementById('reply-indicator');
      if (indicator) {
        indicator.textContent = 'Editing message...';
        indicator.classList.add('visible');
      }
    };
  }

  // Delete button (own messages)
  const deleteBtn = div.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (confirm('Delete this message?')) {
        await deleteMessage(msg.id);
      }
    };
  }

  return div;
}

function renderReactions(msg) {
  if (!msg.reactions || Object.keys(msg.reactions).length === 0) return '';
  return Object.entries(msg.reactions)
    .map(([emoji, users]) => `<span class="reaction" data-emoji="${emoji}" data-msg="${msg.id}">${emoji} ${users.length}</span>`)
    .join('');
}

function showReactionPicker(msgId, anchor) {
  let existing = document.querySelector('.reaction-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = REACTIONS.map(e => `<span class="reaction-option">${e}</span>`).join('');

  picker.onclick = async (e) => {
    const emoji = e.target.textContent;
    if (REACTIONS.includes(emoji)) {
      await addReaction(msgId, emoji);
      picker.remove();
    }
  };

  document.body.appendChild(picker);
  const rect = anchor.getBoundingClientRect();
  picker.style.top = (rect.top - 40) + 'px';
  picker.style.left = rect.left + 'px';

  setTimeout(() => {
    document.addEventListener('click', function handler() {
      picker.remove();
      document.removeEventListener('click', handler);
    }, { once: true });
  }, 0);
}

// Delegate click for reaction toggles
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('reaction')) {
    const emoji = e.target.dataset.emoji;
    const msgId = e.target.dataset.msg;
    if (emoji && msgId) {
      await addReaction(msgId, emoji);
    }
  }
});
