/**
 * ACG CLI - Whiteboard Commands
 * Command palette for dispatching actions across the ACG system.
 * Each command maps to a function that can be called from CLI, API, MCP, or MQTT.
 *
 * Usage:
 *   node cli/index.js whiteboard list
 *   node cli/index.js whiteboard dispatch <command> [args...]
 *   node cli/index.js whiteboard create <name> <handler>
 */
import { MemoryStore } from '../api/server.js';

const store = new MemoryStore();

export const COMMANDS = new Map();

// ── Built-in Commands ────────────────────────────────────────

COMMANDS.set('list', {
  description: 'List all available whiteboard commands',
  handler: async () => {
    const list = [];
    for (const [name, cmd] of COMMANDS) {
      list.push({ name, description: cmd.description, args: cmd.args || [] });
    }
    return list;
  },
});

COMMANDS.set('create', {
  description: 'Register a new whiteboard command',
  args: ['name', 'description'],
  handler: async (args) => {
    const [name, description] = args;
    if (!name) throw new Error('Command name required');
    COMMANDS.set(name, {
      description: description || 'Custom command',
      handler: async () => ({ message: `Custom command "${name}" executed` }),
    });
    return { created: name };
  },
});

COMMANDS.set('dispatch', {
  description: 'Dispatch a command by name',
  args: ['command', '...args'],
  handler: async (args) => {
    const [cmdName, ...cmdArgs] = args;
    const cmd = COMMANDS.get(cmdName);
    if (!cmd) throw new Error(`Unknown command: ${cmdName}`);
    return await cmd.handler(cmdArgs);
  },
});

COMMANDS.set('send-message', {
  description: 'Send a message to a room',
  args: ['room', 'content', 'channel?'],
  handler: async (args) => {
    const [room, content, channel] = args;
    if (!room || !content) throw new Error('Room and content required');
    return await store.sendMessage({ room, content, channel: channel || 'NEU' });
  },
});

COMMANDS.set('list-rooms', {
  description: 'List all rooms',
  handler: async () => await store.getRooms(),
});

COMMANDS.set('create-room', {
  description: 'Create a new room',
  args: ['name', 'description?'],
  handler: async (args) => {
    const [name, description] = args;
    if (!name) throw new Error('Room name required');
    return await store.createRoom({ name, description });
  },
});

COMMANDS.set('export', {
  description: 'Export all data as JSON',
  handler: async () => await store.exportAll(),
});

COMMANDS.set('status', {
  description: 'Show system status',
  handler: async () => ({
    rooms: (await store.getRooms()).length,
    messages: store.messages.length,
    users: store.users.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  }),
});

COMMANDS.set('resolve-path', {
  description: 'Resolve an ISA-95 path',
  args: ['path'],
  handler: async (args) => {
    const { resolvePath } = await import('../../path/index.js');
    return resolvePath(args[0]);
  },
});

COMMANDS.set('list-tags', {
  description: 'List tag instances',
  handler: async () => {
    const { getAllTags } = await import('../../path/tags/registry.js');
    return getAllTags();
  },
});

COMMANDS.set('render-doc', {
  description: 'Render a markdown template',
  args: ['template', 'data?'],
  handler: async (args) => {
    const { renderTemplate } = await import('../../docs/renderer.js');
    const data = args[1] ? JSON.parse(args[1]) : {};
    return renderTemplate(args[0], data);
  },
});

COMMANDS.set('test', {
  description: 'Run test suite',
  args: ['filter?'],
  handler: async (args) => {
    const { run } = await import('../test/runner.js');
    return await run(args);
  },
});

// ── CLI Runner ───────────────────────────────────────────────

export async function run(args) {
  const [subcommand, ...subArgs] = args;

  if (!subcommand || subcommand === 'help') {
    console.log('ACG Whiteboard Commands\n');
    const list = await COMMANDS.get('list').handler();
    for (const cmd of list) {
      const argStr = cmd.args.length > 0 ? ` <${cmd.args.join('> <')}>` : '';
      console.log(`  ${cmd.name}${argStr}`);
      console.log(`    ${cmd.description}\n`);
    }
    return;
  }

  const cmd = COMMANDS.get(subcommand);
  if (!cmd) {
    console.error(`Unknown whiteboard command: ${subcommand}`);
    console.error('Run "node cli/index.js whiteboard help" for available commands');
    process.exit(1);
  }

  const result = await cmd.handler(subArgs);
  console.log(JSON.stringify(result, null, 2));
}

export default run;
