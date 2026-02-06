/**
 * ACG Chat - Chunked Storage
 * Manages message chunking for efficient storage and retrieval.
 * Messages are chunked by date for archival and by room for active use.
 */
import { getAll, put, get } from './db.js';

const CHUNK_SIZE = 100;

export function chunkByDate(messages) {
  const chunks = {};
  for (const msg of messages) {
    const date = new Date(msg.timestamp).toISOString().split('T')[0];
    if (!chunks[date]) chunks[date] = [];
    chunks[date].push(msg);
  }
  return chunks;
}

export function chunkByRoom(messages) {
  const chunks = {};
  for (const msg of messages) {
    if (!chunks[msg.room]) chunks[msg.room] = [];
    chunks[msg.room].push(msg);
  }
  return chunks;
}

export async function getLatestChunk(roomId) {
  const meta = await get('sync', `chunk-meta-${roomId}`);
  if (!meta) return [];
  return meta.messageIds || [];
}

export async function saveChunkMeta(roomId, messageIds) {
  await put('sync', {
    key: `chunk-meta-${roomId}`,
    messageIds: messageIds.slice(-CHUNK_SIZE),
    updated: Date.now(),
  });
}

export async function pruneOldMessages(maxAge = 7 * 24 * 60 * 60 * 1000) {
  const allMessages = await getAll('messages');
  const cutoff = Date.now() - maxAge;
  const old = allMessages.filter(m => m.timestamp < cutoff);
  const archive = chunkByDate(old);
  return { archived: archive, count: old.length };
}

export function buildArchiveFilename(date) {
  return `messages/archive/${date}.json`;
}
