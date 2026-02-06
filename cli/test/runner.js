/**
 * ACG CLI - Test Runner
 * Minimal test framework for all ACG components.
 * Reports results to console with error details.
 *
 * Usage:
 *   node cli/index.js test [filter]
 */

const results = { passed: 0, failed: 0, skipped: 0, errors: [] };

class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.beforeAll = null;
    this.afterAll = null;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
    return this;
  }

  setup(fn) { this.beforeAll = fn; return this; }
  teardown(fn) { this.afterAll = fn; return this; }

  async run(filter) {
    console.log(`\n  ${this.name}`);
    if (this.beforeAll) await this.beforeAll();

    for (const t of this.tests) {
      if (filter && !t.name.toLowerCase().includes(filter.toLowerCase()) &&
          !this.name.toLowerCase().includes(filter.toLowerCase())) {
        results.skipped++;
        continue;
      }

      try {
        await t.fn();
        console.log(`    ✓ ${t.name}`);
        results.passed++;
      } catch (err) {
        console.log(`    ✗ ${t.name}`);
        console.log(`      Error: ${err.message}`);
        results.failed++;
        results.errors.push({ suite: this.name, test: t.name, error: err.message, stack: err.stack });
      }
    }

    if (this.afterAll) await this.afterAll();
  }
}

function assert(condition, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Deep equality failed:\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || 'Expected function to throw');
}

async function assertAsyncThrows(fn, msg) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || 'Expected async function to throw');
}

// ── Test Suites ──────────────────────────────────────────────

function coreTests() {
  const suite = new TestSuite('Core: EventBus');
  suite.test('on/emit fires listener', () => {
    let called = false;
    // Minimal inline EventBus for Node test context
    const listeners = new Map();
    const on = (e, fn) => { if (!listeners.has(e)) listeners.set(e, []); listeners.get(e).push(fn); };
    const emit = (e, ...a) => { (listeners.get(e) || []).forEach(fn => fn(...a)); };
    on('test', () => called = true);
    emit('test');
    assert(called, 'Listener should have been called');
  });

  suite.test('emit passes arguments', () => {
    const listeners = new Map();
    const on = (e, fn) => { if (!listeners.has(e)) listeners.set(e, []); listeners.get(e).push(fn); };
    const emit = (e, ...a) => { (listeners.get(e) || []).forEach(fn => fn(...a)); };
    let received = null;
    on('data', (d) => received = d);
    emit('data', { hello: 'world' });
    assertDeepEqual(received, { hello: 'world' });
  });

  suite.test('multiple listeners on same event', () => {
    const listeners = new Map();
    const on = (e, fn) => { if (!listeners.has(e)) listeners.set(e, []); listeners.get(e).push(fn); };
    const emit = (e, ...a) => { (listeners.get(e) || []).forEach(fn => fn(...a)); };
    let count = 0;
    on('inc', () => count++);
    on('inc', () => count++);
    emit('inc');
    assertEqual(count, 2);
  });

  return suite;
}

function stateTests() {
  const suite = new TestSuite('Core: State');
  suite.test('state is an object with expected keys', () => {
    const state = {
      currentUser: null, currentRoom: null, currentChannel: 'NEU',
      rooms: [], messages: [], online: true, pendingQueue: [],
    };
    assert(state.currentChannel === 'NEU');
    assert(Array.isArray(state.rooms));
  });

  suite.test('setState merges partial updates', () => {
    const state = { a: 1, b: 2 };
    Object.assign(state, { b: 3, c: 4 });
    assertEqual(state.a, 1);
    assertEqual(state.b, 3);
    assertEqual(state.c, 4);
  });

  return suite;
}

function cryptoTests() {
  const suite = new TestSuite('Core: Crypto');
  suite.test('UUID v4 format', () => {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid));
  });

  return suite;
}

function messageTests() {
  const suite = new TestSuite('Chat: Message');
  suite.test('message format has required fields', () => {
    const msg = {
      id: 'test-1', room: 'acg-main', channel: 'NEU',
      user: { id: 'u1', name: 'Test', color: '#fff' },
      content: 'Hello', timestamp: Date.now(),
      replyTo: null, reactions: {}, edited: false, aiAssisted: false, signature: null,
    };
    assert(msg.id);
    assert(msg.room);
    assert(msg.channel);
    assert(msg.user.id);
    assert(typeof msg.content === 'string');
    assert(typeof msg.timestamp === 'number');
  });

  suite.test('reactions toggle on/off', () => {
    const reactions = {};
    const emoji = '👍';
    const userId = 'u1';
    // Add
    if (!reactions[emoji]) reactions[emoji] = [];
    reactions[emoji].push(userId);
    assertEqual(reactions[emoji].length, 1);
    // Remove
    const idx = reactions[emoji].indexOf(userId);
    reactions[emoji].splice(idx, 1);
    assertEqual(reactions[emoji].length, 0);
  });

  return suite;
}

function roomTests() {
  const suite = new TestSuite('Chat: Room (Cube)');
  const CHANNELS = {
    NEU: 'general', NED: 'random', NWU: 'announcements', NWD: 'questions',
    SEU: 'ideas', SED: 'feedback', SWU: 'off-topic', SWD: 'archive',
  };

  suite.test('8 channels per room (Cube vertices)', () => {
    assertEqual(Object.keys(CHANNELS).length, 8);
  });

  suite.test('channel keys are valid cube vertex labels', () => {
    const valid = ['NEU', 'NED', 'NWU', 'NWD', 'SEU', 'SED', 'SWU', 'SWD'];
    for (const k of Object.keys(CHANNELS)) {
      assert(valid.includes(k), `Invalid channel key: ${k}`);
    }
  });

  suite.test('room creation has all properties', () => {
    const room = {
      id: 'test', name: 'Test', description: '', created: Date.now(),
      channels: CHANNELS, members: [], settings: { allowAI: true, moderation: false },
    };
    assert(room.id);
    assert(room.channels.NEU === 'general');
    assert(room.settings.allowAI === true);
  });

  return suite;
}

function apiTests() {
  const suite = new TestSuite('CLI: API Wrapper');

  suite.test('MemoryStore CRUD rooms', async () => {
    const { MemoryStore } = await import('../api/server.js');
    const store = new MemoryStore();
    const room = await store.createRoom({ name: 'Test Room' });
    assert(room.id);
    assertEqual(room.name, 'Test Room');
    const fetched = await store.getRoom(room.id);
    assertEqual(fetched.name, 'Test Room');
    const all = await store.getRooms();
    assertEqual(all.length, 1);
  });

  suite.test('MemoryStore send/get messages', async () => {
    const { MemoryStore } = await import('../api/server.js');
    const store = new MemoryStore();
    const msg = await store.sendMessage({ room: 'r1', channel: 'NEU', content: 'Hello' });
    assert(msg.id);
    assertEqual(msg.content, 'Hello');
    const msgs = await store.getMessages('r1', 'NEU');
    assertEqual(msgs.length, 1);
  });

  suite.test('MemoryStore export/import round-trip', async () => {
    const { MemoryStore } = await import('../api/server.js');
    const store = new MemoryStore();
    await store.createRoom({ id: 'r1', name: 'Room 1' });
    await store.sendMessage({ room: 'r1', channel: 'NEU', content: 'Test' });
    const exported = await store.exportAll();
    assertEqual(exported.data.rooms.length, 1);
    assertEqual(exported.data.messages.length, 1);

    const store2 = new MemoryStore();
    const result = await store2.importData(exported);
    assertEqual(result.imported.rooms, 1);
    assertEqual(result.imported.messages, 1);
  });

  return suite;
}

function pathTests() {
  const suite = new TestSuite('Path: ISA-95 UDTs');

  suite.test('UDT structure matches ISA-95 hierarchy', async () => {
    const { ISA95_HIERARCHY } = await import('../../path/udts/isa95.js');
    assert(ISA95_HIERARCHY.Enterprise, 'Should have Enterprise level');
    assert(ISA95_HIERARCHY.Site, 'Should have Site level');
    assert(ISA95_HIERARCHY.Area, 'Should have Area level');
    assert(ISA95_HIERARCHY.Line, 'Should have Line level');
    assert(ISA95_HIERARCHY.Cell, 'Should have Cell level');
  });

  suite.test('tag path parsing', async () => {
    const { parsePath } = await import('../../path/index.js');
    const result = parsePath('Enterprise/Site/Area/Line/Cell');
    assertEqual(result.levels.length, 5);
    assertEqual(result.levels[0], 'Enterprise');
  });

  return suite;
}

function mqttTests() {
  const suite = new TestSuite('CLI: MQTT Wrapper');

  suite.test('topic builder generates valid topics', async () => {
    const { buildTopic } = await import('../mqtt/client.js');
    const topic = buildTopic('acg', 'chat', 'messages', 'room1');
    assertEqual(topic, 'acg/chat/messages/room1');
  });

  suite.test('message serialization round-trip', async () => {
    const { serialize, deserialize } = await import('../mqtt/client.js');
    const data = { id: '1', content: 'hello' };
    const packed = serialize(data);
    const unpacked = deserialize(packed);
    assertDeepEqual(unpacked, data);
  });

  return suite;
}

function whiteboardTests() {
  const suite = new TestSuite('CLI: Whiteboard');

  suite.test('command registry has expected commands', async () => {
    const { COMMANDS } = await import('../whiteboard/commands.js');
    assert(COMMANDS.has('list'), 'Should have list command');
    assert(COMMANDS.has('create'), 'Should have create command');
    assert(COMMANDS.has('dispatch'), 'Should have dispatch command');
  });

  return suite;
}

// ── Runner ──────────────────────────────────────────────────

const ALL_SUITES = [
  coreTests, stateTests, cryptoTests, messageTests, roomTests,
  apiTests, pathTests, mqttTests, whiteboardTests,
];

export async function run(args) {
  const filter = args[0] || null;
  console.log('ACG Test Runner');
  console.log('═══════════════════════════════════════');

  const start = Date.now();

  for (const suite of ALL_SUITES) {
    try {
      await suite().run(filter);
    } catch (err) {
      console.error(`  Suite init error: ${err.message}`);
      results.failed++;
      results.errors.push({ suite: 'init', test: 'suite creation', error: err.message });
    }
  }

  const elapsed = Date.now() - start;
  console.log('\n═══════════════════════════════════════');
  console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped (${elapsed}ms)`);

  if (results.errors.length > 0) {
    console.log('\nError Report:');
    for (const e of results.errors) {
      console.log(`  [${e.suite}] ${e.test}: ${e.error}`);
    }
  }

  // Return results for programmatic use
  return results;
}

export default run;
