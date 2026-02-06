/**
 * ACG Chat - Main Application Entry Point
 * Wires together all modules and initializes the chat.
 *
 * ACG Principles: Quality, Transparency, Safety, User Agency
 */
import { bus } from './core/events.js';
import { getState, setState, onStateChange } from './core/state.js';
import { openDB } from './storage/db.js';
import { initUser, updateProfile, enableSigning, saveUser } from './chat/user.js';
import { joinRoom, loadRooms, createRoom } from './chat/room.js';
import { initRenderer, renderAll, refreshMessages } from './ui/render.js';
import { initInput } from './ui/input.js';
import { initNotifications, requestPermission } from './ui/notify.js';
import { startLocalSync } from './sync/local.js';
import { startBroadcastSync } from './sync/broadcast.js';
import { startPolling } from './sync/poll.js';
import { joinP2PRoom, getPeerCount } from './sync/p2p.js';
import { exportAll, downloadJSON, uploadJSON, importBackup, deleteAllData } from './storage/export.js';

const DEFAULT_ROOM = 'acg-main';

async function init() {
  try {
    // 1. Open database
    await openDB();

    // 2. Initialize user identity
    const user = await initUser();
    updateUserBadge(user);

    // 3. Load rooms
    await loadRooms();

    // 4. Wire P2P sync to room lifecycle (before first join)
    bus.on('room:joined', (room) => joinP2PRoom(room.id));
    bus.on('p2p:peers-changed', updatePeerCount);
    bus.on('p2p:history-received', () => refreshMessages());
    bus.on('p2p:unavailable', () => {
      console.warn('[ACG Chat] P2P unavailable, using polling only');
    });

    // 5. Auto-join default room (triggers P2P join via event above)
    await joinRoom(DEFAULT_ROOM);

    // 6. Initialize UI
    initRenderer();
    initInput();
    renderAll();

    // 7. Start sync (local + P2P already started via room:joined)
    startBroadcastSync();
    startLocalSync();
    startPolling();

    // 8. Notifications
    initNotifications();

    // 9. Wire up UI buttons
    setupSettings();
    setupRoomCreation();
    setupExportImport();
    setupOnlineStatus();

    // 10. Request notification permission
    requestPermission();

  } catch (err) {
    console.error('[ACG Chat] Init failed:', err);
    document.getElementById('message-list').innerHTML =
      '<div class="empty-state">Failed to initialize. Please refresh the page.</div>';
  }
}

function updateUserBadge(user) {
  const nameEl = document.getElementById('user-name');
  const dotEl = document.getElementById('user-dot');
  if (nameEl) nameEl.textContent = user.name;
  if (dotEl) dotEl.style.background = user.color;
}

function updatePeerCount(count) {
  const el = document.getElementById('peer-count');
  if (!el) return;
  if (count > 0) {
    el.textContent = count + (count === 1 ? ' peer' : ' peers');
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

function setupOnlineStatus() {
  const dot = document.getElementById('status-dot');
  function update() {
    if (dot) {
      dot.className = 'status-dot' + (navigator.onLine ? '' : ' offline');
      dot.title = navigator.onLine ? 'Online' : 'Offline';
    }
  }
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

function setupSettings() {
  const modal = document.getElementById('settings-modal');
  const btn = document.getElementById('settings-btn');
  const cancel = document.getElementById('settings-cancel');
  const save = document.getElementById('settings-save');
  const nameInput = document.getElementById('settings-name');
  const colorInput = document.getElementById('settings-color');
  const signingInput = document.getElementById('settings-signing');
  const deleteBtn = document.getElementById('settings-delete-data');

  btn.addEventListener('click', () => {
    const user = getState().currentUser;
    if (user) {
      nameInput.value = user.name;
      colorInput.value = user.color;
      signingInput.checked = !!user.publicKey;
    }
    modal.classList.remove('hidden');
  });

  cancel.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  save.addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Anonymous Craftsperson';
    const color = colorInput.value;

    const user = await updateProfile({ name, color });
    if (signingInput.checked && user && !user.publicKey) {
      await enableSigning(user);
    }

    updateUserBadge(getState().currentUser);
    modal.classList.add('hidden');
    renderAll();
  });

  deleteBtn.addEventListener('click', async () => {
    if (confirm('Delete all chat data? This cannot be undone.')) {
      await deleteAllData();
      window.location.reload();
    }
  });
}

function setupRoomCreation() {
  const modal = document.getElementById('create-room-modal');
  const btn = document.getElementById('create-room-btn');
  const cancel = document.getElementById('create-room-cancel');
  const confirm = document.getElementById('create-room-confirm');
  const nameInput = document.getElementById('new-room-name');
  const descInput = document.getElementById('new-room-desc');

  btn.addEventListener('click', () => {
    nameInput.value = '';
    descInput.value = '';
    modal.classList.remove('hidden');
    nameInput.focus();
  });

  cancel.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  confirm.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    await joinRoom(id);

    const state = getState();
    if (state.currentRoom) {
      const room = state.currentRoom;
      room.name = name;
      room.description = descInput.value.trim();
      const { put } = await import('./storage/db.js');
      await put('rooms', room);
    }

    modal.classList.add('hidden');
    renderAll();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm.click();
  });
}

function setupExportImport() {
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');

  exportBtn.addEventListener('click', async () => {
    const data = await exportAll();
    downloadJSON(data, `acg-chat-backup-${new Date().toISOString().split('T')[0]}.json`);
  });

  importBtn.addEventListener('click', async () => {
    try {
      const data = await uploadJSON();
      const result = await importBackup(data);
      alert(`Imported: ${result.imported.messages} messages, ${result.imported.rooms} rooms`);
      window.location.reload();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });
}

// Mobile sidebar toggle
document.querySelector('.topbar h1').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Start the app
init();
