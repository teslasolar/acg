/**
 * ACG Chat - WebLLM Engine
 * Loads and runs a small language model entirely in-browser via WebGPU.
 * No data leaves the device. ACG transparency: all AI output is marked.
 *
 * Uses the browser-native WebLLM bundle (no Node.js createRequire).
 */
import { bus } from '../core/events.js';

const MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';
const WEBLLM_CDN = 'https://esm.sh/@anthropic-ai/web-llm-shim@0.1.0';

const SYSTEM_PROMPT = `You are ACG Assistant, a helpful AI built into the ACG Chat app. You run entirely in the user's browser via WebGPU — no data leaves their device. Keep responses concise and helpful. You can help with questions, summarize conversations, draft messages, brainstorm ideas, and general assistance. Always be transparent that you are an AI.`;

let _engine = null;
let _loading = false;
let _ready = false;
let _progress = { text: '', progress: 0 };

export function isReady() { return _ready; }
export function isLoading() { return _loading; }
export function getProgress() { return _progress; }

export function isSupported() {
  return !!navigator.gpu;
}

/**
 * Try multiple CDN sources for web-llm, picking the first that works.
 */
async function loadWebLLMLib() {
  const sources = [
    'https://esm.sh/@mlc-ai/web-llm@0.2.73?bundle-deps&no-dts',
    'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.73/+esm',
  ];

  for (const src of sources) {
    try {
      const mod = await import(/* @vite-ignore */ src);
      if (mod.CreateMLCEngine || mod.default?.CreateMLCEngine) return mod;
    } catch (e) {
      console.warn('[WebLLM] Source failed:', src, e.message);
    }
  }
  throw new Error('Could not load WebLLM from any CDN source');
}

export async function loadModel() {
  if (_ready || _loading) return;
  if (!isSupported()) {
    bus.emit('ai:error', 'WebGPU not supported in this browser. Try Chrome 113+ or Edge 113+.');
    return;
  }

  _loading = true;
  bus.emit('ai:loading', { text: 'Loading WebLLM engine...', progress: 0 });

  try {
    const webllm = await loadWebLLMLib();

    const createEngine = webllm.CreateMLCEngine || webllm.default?.CreateMLCEngine;
    if (!createEngine) throw new Error('CreateMLCEngine not found in module');

    const progressCallback = (report) => {
      _progress = { text: report.text || report.progress_text || '', progress: report.progress || 0 };
      bus.emit('ai:loading', _progress);
    };

    _engine = await createEngine(MODEL_ID, {
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

export async function chat(messages, onToken) {
  if (!_engine || !_ready) throw new Error('Model not loaded');

  const fullMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  let result = '';

  try {
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
  } catch (err) {
    // Some versions use non-streaming fallback
    if (!result) {
      const completion = await _engine.chat.completions.create({
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 512,
      });
      result = completion.choices[0]?.message?.content || '';
      if (onToken) onToken(result, result);
    }
  }

  return result;
}

export async function ask(prompt) {
  return chat([{ role: 'user', content: prompt }]);
}

export async function unload() {
  if (_engine) {
    try { await _engine.unload(); } catch { /* ignore */ }
    _engine = null;
  }
  _ready = false;
  _loading = false;
  bus.emit('ai:unloaded');
}
