/**
 * ACG Chat - AI Assistant Panel
 * Slide-out panel for chatting with the local WebLLM model.
 * All inference runs on-device. ACG transparency: clearly labeled AI.
 */
import { bus } from '../core/events.js';
import { loadModel, chat, isReady, isLoading, isSupported, unload } from './llm.js';
import { sendToChannel } from '../chat/room.js';
import { getState } from '../core/state.js';

let _history = [];

export function initAIPanel() {
  const toggle = document.getElementById('ai-panel-toggle');
  const panel = document.getElementById('ai-panel');
  const close = document.getElementById('ai-panel-close');
  const loadBtn = document.getElementById('ai-load-btn');
  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send-btn');
  const sendToChat = document.getElementById('ai-send-to-chat');
  const messages = document.getElementById('ai-messages');
  const status = document.getElementById('ai-status');
  const unloadBtn = document.getElementById('ai-unload-btn');

  if (!toggle || !panel) return;

  // Check WebGPU support up front
  if (!isSupported()) {
    status.innerHTML = '<span class="ai-status-error">WebGPU not available in this browser. Try Chrome/Edge 113+.</span>';
    if (loadBtn) loadBtn.disabled = true;
  }

  // Toggle panel open/close
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
  });
  close.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Load model
  loadBtn.addEventListener('click', async () => {
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    await loadModel();
  });

  // Unload model
  unloadBtn.addEventListener('click', async () => {
    await unload();
    _history = [];
    messages.innerHTML = '';
    status.innerHTML = '<span class="ai-status-info">Model unloaded. GPU memory freed.</span>';
    loadBtn.disabled = false;
    loadBtn.textContent = 'Load Model';
    setInputEnabled(false);
  });

  // Loading progress
  bus.on('ai:loading', ({ text, progress }) => {
    const pct = Math.round(progress * 100);
    status.innerHTML = `
      <div class="ai-progress">
        <div class="ai-progress-bar" style="width:${pct}%"></div>
      </div>
      <span class="ai-status-info">${text}</span>`;
  });

  // Model ready
  bus.on('ai:ready', () => {
    status.innerHTML = '<span class="ai-status-ok">SmolLM2-360M ready (on-device)</span>';
    loadBtn.style.display = 'none';
    unloadBtn.style.display = '';
    setInputEnabled(true);
    appendMessage('assistant', 'Hi! I\'m your local AI assistant running entirely in your browser. No data leaves your device. How can I help?');
  });

  // Error
  bus.on('ai:error', (msg) => {
    status.innerHTML = `<span class="ai-status-error">${msg}</span>`;
    loadBtn.disabled = false;
    loadBtn.textContent = 'Load Model';
  });

  // Unloaded
  bus.on('ai:unloaded', () => {
    setInputEnabled(false);
    loadBtn.style.display = '';
    unloadBtn.style.display = 'none';
  });

  // Send message to AI
  async function handleSend() {
    const text = input.value.trim();
    if (!text || !isReady()) return;

    input.value = '';
    appendMessage('user', text);
    _history.push({ role: 'user', content: text });

    const responseEl = appendMessage('assistant', '');
    const contentEl = responseEl.querySelector('.ai-msg-content');
    setInputEnabled(false);

    try {
      const result = await chat(_history, (token, full) => {
        contentEl.textContent = full;
        messages.scrollTop = messages.scrollHeight;
      });
      _history.push({ role: 'assistant', content: result });

      // Show "Send to chat" button on the last assistant message
      const sendBtn = responseEl.querySelector('.ai-msg-send-to-chat');
      if (sendBtn) sendBtn.style.display = '';
    } catch (err) {
      contentEl.textContent = 'Error: ' + err.message;
    }

    setInputEnabled(true);
    input.focus();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  sendBtn.addEventListener('click', handleSend);

  // Send AI response to the group chat (marked as AI-assisted)
  messages.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('ai-msg-send-to-chat')) return;
    const content = e.target.closest('.ai-msg').querySelector('.ai-msg-content').textContent;
    if (!content) return;
    const state = getState();
    if (!state.currentRoom) return;
    try {
      await sendToChannel(content, { aiAssisted: true });
      e.target.textContent = 'Sent!';
      e.target.disabled = true;
    } catch (err) {
      e.target.textContent = 'Failed';
    }
  });

  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role}`;
    const label = role === 'user' ? 'You' : 'AI Assistant';
    div.innerHTML = `
      <div class="ai-msg-header">${label}</div>
      <div class="ai-msg-content">${escapeHtml(text)}</div>
      ${role === 'assistant' && text ? '<button class="ai-msg-send-to-chat btn" style="display:none">Send to chat</button>' : ''}
      ${role === 'assistant' && !text ? '<button class="ai-msg-send-to-chat btn" style="display:none">Send to chat</button>' : ''}
    `;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function setInputEnabled(enabled) {
    input.disabled = !enabled;
    sendBtn.disabled = !enabled;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Start with input disabled until model loads
  setInputEnabled(false);
  unloadBtn.style.display = 'none';
}
