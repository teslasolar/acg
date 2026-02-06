/**
 * ACG Chat - Export/Import
 * User agency: export all data anytime, import backups.
 */
import { getAll } from './db.js';
import { put, clearStore } from './db.js';

export async function exportAll() {
  const [users, rooms, messages] = await Promise.all([
    getAll('users'),
    getAll('rooms'),
    getAll('messages'),
  ]);

  return {
    version: 1,
    exported: new Date().toISOString(),
    app: 'acg-chat',
    data: { users, rooms, messages },
  };
}

export async function importBackup(backup) {
  if (!backup || backup.app !== 'acg-chat') {
    throw new Error('Invalid backup file');
  }

  const { users = [], rooms = [], messages = [] } = backup.data || {};

  const ops = [];
  for (const u of users) ops.push(put('users', u));
  for (const r of rooms) ops.push(put('rooms', r));
  for (const m of messages) ops.push(put('messages', m));

  await Promise.all(ops);

  return {
    imported: {
      users: users.length,
      rooms: rooms.length,
      messages: messages.length,
    },
  };
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function uploadJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}

export async function deleteAllData() {
  await Promise.all([
    clearStore('users'),
    clearStore('rooms'),
    clearStore('messages'),
    clearStore('sync'),
  ]);
  localStorage.removeItem('acg-chat-user');
  localStorage.removeItem('acg-chat-sync');
}
