/**
 * ACG Chat - Room (Cube-based)
 * Each room is a Konomi Cube: 8 vertices = 8 topic channels + central main chat.
 */
import { generateUUID } from '../core/crypto.js';
import { bus } from '../core/events.js';
import { getState, setState } from '../core/state.js';
import { put, get, getAll } from '../storage/db.js';
import { getMessagesByRoomChannel } from '../storage/db.js';
import { sendMessage } from './message.js';

export const CHANNELS = {
  NEU: 'general',
  NED: 'random',
  NWU: 'announcements',
  NWD: 'questions',
  SEU: 'ideas',
  SED: 'feedback',
  SWU: 'off-topic',
  SWD: 'archive',
};

export const CHANNEL_KEYS = Object.keys(CHANNELS);

export function createRoom(opts = {}) {
  return {
    id: opts.id || generateUUID(),
    name: opts.name || 'New Room',
    description: opts.description || '',
    created: Date.now(),
    channels: { ...CHANNELS },
    members: [],
    settings: {
      allowAI: true,
      moderation: false,
      ...opts.settings,
    },
  };
}

export async function loadRooms() {
  const rooms = await getAll('rooms');
  setState({ rooms });
  return rooms;
}

export async function joinRoom(roomId) {
  let room = await get('rooms', roomId);
  if (!room) {
    room = createRoom({ id: roomId, name: roomId });
    await put('rooms', room);
  }

  const user = getState().currentUser;
  if (user && !room.members.includes(user.id)) {
    room.members.push(user.id);
    await put('rooms', room);
  }

  setState({ currentRoom: room, currentChannel: 'NEU' });
  bus.emit('room:joined', room);

  const rooms = await getAll('rooms');
  setState({ rooms });

  return room;
}

export async function leaveRoom(roomId) {
  const room = await get('rooms', roomId);
  if (!room) return;

  const user = getState().currentUser;
  if (user) {
    room.members = room.members.filter(id => id !== user.id);
    await put('rooms', room);
  }

  const state = getState();
  if (state.currentRoom && state.currentRoom.id === roomId) {
    setState({ currentRoom: null, currentChannel: 'NEU' });
  }

  const rooms = await getAll('rooms');
  setState({ rooms });
  bus.emit('room:left', room);
}

export function switchChannel(channelKey) {
  if (!CHANNELS[channelKey]) return;
  setState({ currentChannel: channelKey });
  bus.emit('room:channel-changed', channelKey);
}

export async function getChannelMessages(roomId, channel, limit = 200) {
  return getMessagesByRoomChannel(roomId, channel, limit);
}

export async function sendToChannel(content, opts = {}) {
  const state = getState();
  if (!state.currentRoom) throw new Error('No room selected');

  return sendMessage({
    room: state.currentRoom.id,
    channel: state.currentChannel,
    content,
    ...opts,
  });
}

export function getChannelName(key) {
  return CHANNELS[key] || key;
}
