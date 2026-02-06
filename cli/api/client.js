/**
 * ACG CLI - API Client Wrapper
 * Universal HTTP API wrapper for interacting with ACG services.
 * Works in both Node.js (CLI) and browser contexts.
 */

const DEFAULT_BASE = 'http://localhost:3000/api';

export class APIClient {
  constructor(opts = {}) {
    this.base = (opts.base || DEFAULT_BASE).replace(/\/$/, '');
    this.headers = { 'Content-Type': 'application/json', ...opts.headers };
    this.timeout = opts.timeout || 10000;
    this._interceptors = { request: [], response: [], error: [] };
  }

  // --- Interceptors ---

  onRequest(fn) { this._interceptors.request.push(fn); }
  onResponse(fn) { this._interceptors.response.push(fn); }
  onError(fn) { this._interceptors.error.push(fn); }

  // --- Core request ---

  async request(method, path, body, opts = {}) {
    let url = `${this.base}${path}`;
    let config = {
      method,
      headers: { ...this.headers, ...opts.headers },
      signal: AbortSignal.timeout(this.timeout),
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    // Apply request interceptors
    for (const fn of this._interceptors.request) {
      const result = fn({ url, config, body });
      if (result) ({ url, config } = { url, config, ...result });
    }

    try {
      const res = await fetch(url, config);
      const data = res.headers.get('content-type')?.includes('json')
        ? await res.json()
        : await res.text();

      const response = { ok: res.ok, status: res.status, data, headers: res.headers };

      for (const fn of this._interceptors.response) fn(response);

      if (!res.ok) {
        const err = new Error(`API ${res.status}: ${typeof data === 'string' ? data : data.error || res.statusText}`);
        err.status = res.status;
        err.response = response;
        throw err;
      }

      return response;
    } catch (err) {
      for (const fn of this._interceptors.error) fn(err);
      throw err;
    }
  }

  // --- HTTP methods ---

  get(path, opts) { return this.request('GET', path, null, opts); }
  post(path, body, opts) { return this.request('POST', path, body, opts); }
  put(path, body, opts) { return this.request('PUT', path, body, opts); }
  patch(path, body, opts) { return this.request('PATCH', path, body, opts); }
  delete(path, opts) { return this.request('DELETE', path, null, opts); }

  // --- Chat-specific endpoints ---

  async getRooms() { return (await this.get('/rooms')).data; }
  async getRoom(id) { return (await this.get(`/rooms/${id}`)).data; }
  async createRoom(room) { return (await this.post('/rooms', room)).data; }

  async getMessages(roomId, channel, opts = {}) {
    const params = new URLSearchParams({ channel, limit: opts.limit || 100 });
    return (await this.get(`/rooms/${roomId}/messages?${params}`)).data;
  }

  async sendMessage(roomId, msg) {
    return (await this.post(`/rooms/${roomId}/messages`, msg)).data;
  }

  async getUsers() { return (await this.get('/users')).data; }
  async getUser(id) { return (await this.get(`/users/${id}`)).data; }

  // --- Health check ---

  async health() {
    try {
      const res = await this.get('/health');
      return { ok: true, ...res.data };
    } catch {
      return { ok: false };
    }
  }
}

export default APIClient;
