/**
 * ACG Chat - WebLLM Engine
 * Loads and runs a small language model entirely in-browser via WebGPU.
 * No data leaves the device. ACG transparency: all AI output is marked.
 */
import { bus } from '../core/events.js';

const MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

const SYSTEM_PROMPT = `You are ACG Assistant, a helpful AI built into the ACG Chat app. You run entirely in the user's browser via WebGPU — no data leaves their device. Keep responses concise and helpful. You can help with questions, summarize conversations, draft messages, brainstorm ideas, and general assistance. Always be transparent that you are an AI.`;

let _engine = null;
let _loading = false;
let _ready = false;
let _progress = { text: '', progress: 0 };

export function isReady() { return _ready; }
export function isLoading() { return _loading; }
export function getProgress() { return _progress; }

/**
 * Check if the browser supports WebGPU (required for WebLLM).
 */
export function isSupported() {
  return !!navigator.gpu;
}

/**
 * Load the WebLLM engine and download/cache the model.
 * Progress updates are emitted via the event bus.
 */
export async function loadModel() {
  if (_ready || _loading) return;
  if (!isSupported()) {
    bus.emit('ai:error', 'WebGPU not supported in this browser. Try Chrome 113+ or Edge 113+.');
    return;
  }

  _loading = true;
  bus.emit('ai:loading', { text: 'Loading WebLLM engine...', progress: 0 });

  try {
    const webllm = await import('https://esm.sh/@mlc-ai/web-llm');

    const progressCallback = (report) => {
      _progress = { text: report.text, progress: report.progress || 0 };
      bus.emit('ai:loading', _progress);
    };

    _engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: progressCallback,
    });

    _ready = true;
    _loading = false;
    bus.emit('ai:ready');
  } catch (err) {
    _loading = false;
    _ready = false;
    console.error('[WebLLM] Load failed:', err);
    bus.emit('ai:error', 'Failed to load model: ' + err.message);
  }
}

/**
 * Generate a chat completion from the local model.
 * Streams tokens back via the callback.
 */
export async function chat(messages, onToken) {
  if (!_engine || !_ready) {
    throw new Error('Model not loaded');
  }

  const fullMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  let result = '';

  const completion = await _engine.chat.completions.create({
    messages: fullMessages,
    temperature: 0.7,
    max_tokens: 512,
    stream: true,
  });

  for await (const chunk of completion) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      result += delta;
      if (onToken) onToken(delta, result);
    }
  }

  return result;
}

/**
 * Single-turn helper: ask a question, get a complete answer.
 */
export async function ask(prompt) {
  return chat([{ role: 'user', content: prompt }]);
}

/**
 * Unload the model and free GPU memory.
 */
export async function unload() {
  if (_engine) {
    try {
      await _engine.unload();
    } catch { /* ignore */ }
    _engine = null;
  }
  _ready = false;
  _loading = false;
  bus.emit('ai:unloaded');
}
