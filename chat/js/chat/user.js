/**
 * ACG Chat - User Identity
 * No auth required. Users get a generated identity stored locally.
 * Full user agency: choose name, color, export/delete anytime.
 */
import { generateUUID, generateKeyPair } from '../core/crypto.js';
import { put, get } from '../storage/db.js';
import { bus } from '../core/events.js';
import { setState } from '../core/state.js';

const USER_STORAGE_KEY = 'acg-chat-user';
const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function createUser(overrides = {}) {
  return {
    id: generateUUID(),
    name: 'Anonymous Craftsperson',
    color: randomColor(),
    publicKey: null,
    privateKey: null,
    created: Date.now(),
    rooms: [],
    blocked: [],
    ...overrides,
  };
}

export async function loadUser() {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  if (stored) {
    try {
      const user = JSON.parse(stored);
      setState({ currentUser: user });
      bus.emit('user:loaded', user);
      return user;
    } catch {
      // corrupted, create new
    }
  }
  return null;
}

export async function saveUser(user) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  await put('users', user);
  setState({ currentUser: user });
  bus.emit('user:updated', user);
}

export async function initUser() {
  let user = await loadUser();
  if (!user) {
    user = createUser();
    await saveUser(user);
    bus.emit('user:created', user);
  }
  return user;
}

export async function updateProfile(updates) {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  if (!stored) return null;
  const user = { ...JSON.parse(stored), ...updates };
  await saveUser(user);
  return user;
}

export async function enableSigning(user) {
  const { publicKey, privateKey } = await generateKeyPair();
  return updateProfile({ publicKey, privateKey });
}

export function isBlocked(user, targetId) {
  return (user.blocked || []).includes(targetId);
}

export async function blockUser(targetId) {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  if (!stored) return;
  const user = JSON.parse(stored);
  const blocked = new Set(user.blocked || []);
  blocked.add(targetId);
  await updateProfile({ blocked: [...blocked] });
  bus.emit('user:blocked', targetId);
}

export async function unblockUser(targetId) {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  if (!stored) return;
  const user = JSON.parse(stored);
  const blocked = new Set(user.blocked || []);
  blocked.delete(targetId);
  await updateProfile({ blocked: [...blocked] });
  bus.emit('user:unblocked', targetId);
}
