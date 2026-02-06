/**
 * ACG Chat - Message Input
 * Handles message composition, sending, and keyboard shortcuts.
 */
import { sendToChannel } from '../chat/room.js';
import { editMessage } from '../chat/message.js';
import { getReplyTo, setReplyTo, getEditingId, setEditingId } from './render.js';

export function initInput() {
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const aiToggle = document.getElementById('ai-toggle');
  const cancelReply = document.getElementById('cancel-reply');

  if (!input || !sendBtn) return;

  async function handleSend() {
    const content = input.value.trim();
    if (!content) return;

    const editId = getEditingId();
    if (editId) {
      await editMessage(editId, content);
      clearCompose();
      return;
    }

    const aiAssisted = aiToggle ? aiToggle.checked : false;
    const replyTo = getReplyTo();

    try {
      await sendToChannel(content, { aiAssisted, replyTo });
      clearCompose();
    } catch (err) {
      console.error('[Input] Send failed:', err);
    }
  }

  function clearCompose() {
    input.value = '';
    setReplyTo(null);
    setEditingId(null);
    const indicator = document.getElementById('reply-indicator');
    if (indicator) indicator.classList.remove('visible');
    input.focus();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      clearCompose();
    }
  });

  sendBtn.addEventListener('click', handleSend);

  if (cancelReply) {
    cancelReply.addEventListener('click', clearCompose);
  }
}
