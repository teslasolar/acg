/**
 * ACG CLI - API Wrapper
 * Lightweight HTTP server that wraps chat functions as a REST API.
 * Enables external tools, bots, and integrations to interact with ACG Chat.
 *
 * Routes:
 *   GET  /api/health           - Health check
 *   GET  /api/rooms            - List rooms
 *   GET  /api/rooms/:id        - Get room details
 *   POST /api/rooms            - Create room
 *   GET  /api/messages/:room   - Get messages for a room
 *   POST /api/messages         - Send a message
 *   GET  /api/users/:id        - Get user info
 *   POST /api/export           - Export all data
 *   POST /api/import           - Import data
 */
import http from 'node:http';
import { EventEmitter } from 'node:events';

export class APIServer extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.port = opts.port || 3000;
    this.store = opts.store || new MemoryStore();
    this.server = null;
  }

  start() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.port, () => {
      console.log(`[API] ACG API server listening on http://localhost:${this.port}`);
      this.emit('ready', this.port);
    });
    return this;
  }

  stop() {
    if (this.server) this.server.close();
  }

  async handleRequest(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${this.port}`);
    const path = url.pathname;
    const method = req.method;

    try {
      let body = null;
      if (method === 'POST' || method === 'PUT') {
        body = await readBody(req);
      }

      const result = await this.route(method, path, body, url.searchParams);
      res.writeHead(result.status || 200);
      res.end(JSON.stringify(result.data || result));
    } catch (err) {
      const status = err.status || 500;
      res.writeHead(status);
      res.end(JSON.stringify({ error: err.message, status }));
      this.emit('error', err);
    }
  }

  async route(method, path, body, params) {
    // Health
    if (path === '/api/health') {
      return { status: 200, data: { ok: true, timestamp: Date.now(), version: '1.0.0' } };
    }

    // Rooms
    if (path === '/api/rooms' && method === 'GET') {
      return { status: 200, data: await this.store.getRooms() };
    }
    if (path.startsWith('/api/rooms/') && method === 'GET') {
      const id = path.split('/')[3];
      const room = await this.store.getRoom(id);
      if (!room) throw Object.assign(new Error('Room not found'), { status: 404 });
      return { status: 200, data: room };
    }
    if (path === '/api/rooms' && method === 'POST') {
      const room = await this.store.createRoom(body);
      this.emit('room:created', room);
      return { status: 201, data: room };
    }

    // Messages
    if (path.startsWith('/api/messages/') && method === 'GET') {
      const roomId = path.split('/')[3];
      const channel = params.get('channel') || 'NEU';
      const limit = parseInt(params.get('limit') || '100', 10);
      const messages = await this.store.getMessages(roomId, channel, limit);
      return { status: 200, data: messages };
    }
    if (path === '/api/messages' && method === 'POST') {
      const msg = await this.store.sendMessage(body);
      this.emit('message:sent', msg);
      return { status: 201, data: msg };
    }

    // Users
    if (path.startsWith('/api/users/') && method === 'GET') {
      const id = path.split('/')[3];
      const user = await this.store.getUser(id);
      if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
      return { status: 200, data: user };
    }

    // Export
    if (path === '/api/export' && method === 'POST') {
      return { status: 200, data: await this.store.exportAll() };
    }

    // Import
    if (path === '/api/import' && method === 'POST') {
      const result = await this.store.importData(body);
      return { status: 200, data: result };
    }

    throw Object.assign(new Error('Not found'), { status: 404 });
  }
}

/**
 * In-memory store for the API server (can be replaced with file-backed or DB store).
 */
export class MemoryStore {
  constructor() {
    this.rooms = new Map();
    this.messages = [];
    this.users = new Map();
    this._idCounter = 0;
  }

  _genId() {
    return `${Date.now()}-${++this._idCounter}`;
  }

  async getRooms() {
    return [...this.rooms.values()];
  }

  async getRoom(id) {
    return this.rooms.get(id) || null;
  }

  async createRoom(data) {
    const room = {
      id: data.id || this._genId(),
      name: data.name || 'Untitled',
      description: data.description || '',
      channels: {
        NEU: 'general', NED: 'random', NWU: 'announcements', NWD: 'questions',
        SEU: 'ideas', SED: 'feedback', SWU: 'off-topic', SWD: 'archive',
      },
      members: [],
      created: Date.now(),
    };
    this.rooms.set(room.id, room);
    return room;
  }

  async getMessages(roomId, channel, limit = 100) {
    return this.messages
      .filter(m => m.room === roomId && m.channel === channel)
      .slice(-limit);
  }

  async sendMessage(data) {
    const msg = {
      id: this._genId(),
      room: data.room,
      channel: data.channel || 'NEU',
      user: data.user || { id: 'api', name: 'API', color: '#6366f1' },
      content: data.content,
      timestamp: Date.now(),
      replyTo: data.replyTo || null,
      reactions: {},
      edited: false,
      aiAssisted: data.aiAssisted || false,
      signature: null,
    };
    this.messages.push(msg);
    return msg;
  }

  async getUser(id) {
    return this.users.get(id) || null;
  }

  async exportAll() {
    return {
      version: 1,
      exported: new Date().toISOString(),
      app: 'acg-chat',
      data: {
        rooms: [...this.rooms.values()],
        messages: this.messages,
        users: [...this.users.values()],
      },
    };
  }

  async importData(data) {
    let count = { rooms: 0, messages: 0, users: 0 };
    if (data?.data?.rooms) {
      for (const r of data.data.rooms) { this.rooms.set(r.id, r); count.rooms++; }
    }
    if (data?.data?.messages) {
      this.messages.push(...data.data.messages); count.messages = data.data.messages.length;
    }
    if (data?.data?.users) {
      for (const u of data.data.users) { this.users.set(u.id, u); count.users++; }
    }
    return { imported: count };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : null); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

export async function run(args) {
  const port = parseInt(args[0], 10) || 3000;
  const server = new APIServer({ port });
  server.start();
}

export default run;
