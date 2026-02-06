/**
 * ACG Chat - Notifications
 * Browser notifications and in-app notification sounds/badges.
 */
import { bus } from '../core/events.js';
import { getState } from '../core/state.js';

let _permission = 'default';
let _unread = 0;
let _originalTitle = document.title;

export function initNotifications() {
  if ('Notification' in window) {
    _permission = Notification.permission;
  }

  bus.on('message:new', (msg) => {
    const state = getState();
    const user = state.currentUser;
    if (!user || msg.user.id === user.id) return;

    if (document.hidden) {
      _unread++;
      document.title = `(${_unread}) ${_originalTitle}`;
      showNotification(msg);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      _unread = 0;
      document.title = _originalTitle;
    }
  });
}

export async function requestPermission() {
  if (!('Notification' in window)) return false;
  const result = await Notification.requestPermission();
  _permission = result;
  return result === 'granted';
}

function showNotification(msg) {
  if (_permission !== 'granted') return;

  try {
    new Notification(`${msg.user.name} in #${msg.channel}`, {
      body: msg.content.slice(0, 100),
      tag: 'acg-chat-' + msg.id,
      silent: false,
    });
  } catch {
    // notifications not supported in this context
  }
}

export function getUnreadCount() {
  return _unread;
}

export function resetUnread() {
  _unread = 0;
  document.title = _originalTitle;
}
