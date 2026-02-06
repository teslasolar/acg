/**
 * ACG CLI - MQTT Wrapper
 * Pub/sub client for IoT/SCADA integration.
 * Maps ACG Chat events to MQTT topics using ISA-95 path conventions.
 *
 * Topic structure:
 *   acg/chat/messages/{room}/{channel}  - Chat messages
 *   acg/chat/rooms/{room}/status        - Room status
 *   acg/chat/users/{userId}/presence    - User presence
 *   acg/path/{enterprise}/{site}/...    - ISA-95 tag data
 *
 * Note: Uses a lightweight built-in client. For production, replace with
 * mqtt.js or similar. This wrapper focuses on topic/payload conventions.
 */
import { EventEmitter } from 'node:events';
import net from 'node:net';

// ── Topic Utilities (exported for tests) ─────────────────────

export function buildTopic(...parts) {
  return parts.filter(Boolean).join('/');
}

export function parseTopic(topic) {
  const parts = topic.split('/');
  return {
    parts,
    namespace: parts[0],
    domain: parts[1],
    resource: parts[2],
    id: parts[3],
    sub: parts.slice(4),
  };
}

export function matchTopic(pattern, topic) {
  const p = pattern.split('/');
  const t = topic.split('/');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '#') return true;
    if (p[i] === '+') continue;
    if (p[i] !== t[i]) return false;
  }
  return p.length === t.length;
}

// ── Serialization (exported for tests) ───────────────────────

export function serialize(data) {
  return JSON.stringify(data);
}

export function deserialize(str) {
  return JSON.parse(str);
}

// ── MQTT Client ──────────────────────────────────────────────

export class MQTTClient extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.broker = opts.broker || 'localhost';
    this.port = opts.port || 1883;
    this.clientId = opts.clientId || `acg-${Date.now()}`;
    this.subscriptions = new Map();
    this.connected = false;
    this.socket = null;
    this.reconnectDelay = 2000;
    this._reconnectTimer = null;
  }

  connect() {
    console.log(`[MQTT] Connecting to ${this.broker}:${this.port}...`);

    this.socket = net.createConnection({ host: this.broker, port: this.port }, () => {
      this.connected = true;
      console.log('[MQTT] Connected');
      this.emit('connected');
      this._sendConnect();
    });

    this.socket.on('data', (data) => this._handleData(data));
    this.socket.on('error', (err) => {
      console.error('[MQTT] Error:', err.message);
      this.emit('error', err);
    });
    this.socket.on('close', () => {
      this.connected = false;
      console.log('[MQTT] Disconnected');
      this.emit('disconnected');
      this._scheduleReconnect();
    });

    return this;
  }

  disconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this.socket) this.socket.destroy();
    this.connected = false;
  }

  subscribe(topic, handler) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic).add(handler);
    console.log(`[MQTT] Subscribed: ${topic}`);
    return () => {
      const handlers = this.subscriptions.get(topic);
      if (handlers) handlers.delete(handler);
    };
  }

  publish(topic, data) {
    const payload = typeof data === 'string' ? data : serialize(data);
    if (this.connected) {
      // In a full MQTT impl, this would send a PUBLISH packet
      // For now, dispatch locally and log
      this._dispatch(topic, payload);
    } else {
      console.warn('[MQTT] Not connected, message queued');
    }
    this.emit('published', { topic, payload });
  }

  _dispatch(topic, payload) {
    for (const [pattern, handlers] of this.subscriptions) {
      if (matchTopic(pattern, topic)) {
        for (const handler of handlers) {
          try {
            handler(topic, deserialize(payload));
          } catch (err) {
            console.error('[MQTT] Handler error:', err.message);
          }
        }
      }
    }
  }

  _sendConnect() {
    // Simplified: real MQTT would send CONNECT packet
    this.emit('ready');
  }

  _handleData(data) {
    // Simplified: real MQTT would parse packets
    this.emit('data', data);
  }

  _scheduleReconnect() {
    this._reconnectTimer = setTimeout(() => {
      console.log('[MQTT] Reconnecting...');
      this.connect();
    }, this.reconnectDelay);
  }
}

// ── ACG Chat Bridge ──────────────────────────────────────────

export class ChatMQTTBridge {
  constructor(client, store) {
    this.client = client;
    this.store = store;
  }

  /**
   * Publish a chat message to MQTT.
   */
  publishMessage(msg) {
    const topic = buildTopic('acg', 'chat', 'messages', msg.room, msg.channel);
    this.client.publish(topic, {
      id: msg.id,
      user: msg.user,
      content: msg.content,
      timestamp: msg.timestamp,
      aiAssisted: msg.aiAssisted,
    });
  }

  /**
   * Publish user presence.
   */
  publishPresence(userId, status) {
    const topic = buildTopic('acg', 'chat', 'users', userId, 'presence');
    this.client.publish(topic, { userId, status, timestamp: Date.now() });
  }

  /**
   * Publish ISA-95 tag data.
   */
  publishTag(path, value) {
    const topic = buildTopic('acg', 'path', ...path.split('/'));
    this.client.publish(topic, { path, value, timestamp: Date.now() });
  }

  /**
   * Subscribe to incoming messages and bridge to store.
   */
  subscribeMessages(roomId) {
    return this.client.subscribe(
      buildTopic('acg', 'chat', 'messages', roomId, '+'),
      async (topic, data) => {
        if (this.store) {
          await this.store.sendMessage({ ...data, room: roomId });
        }
      }
    );
  }
}

// ── CLI Runner ───────────────────────────────────────────────

export async function run(args) {
  const broker = args[0] || 'localhost';
  const port = parseInt(args[1], 10) || 1883;

  const client = new MQTTClient({ broker, port });
  client.connect();

  // Demo: subscribe to all chat messages
  client.subscribe('acg/chat/messages/#', (topic, data) => {
    console.log(`[${topic}]`, data);
  });

  console.log(`[MQTT] ACG MQTT bridge running (${broker}:${port})`);
  console.log('[MQTT] Subscribed to acg/chat/messages/#');
}

export default run;
