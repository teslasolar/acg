/**
 * ACG CLI - MCP Server Wrapper
 * Model Context Protocol server for AI tool integration.
 * Exposes ACG Chat functions as MCP tools over stdio.
 *
 * Tools:
 *   acg_send_message    - Send a message to a room/channel
 *   acg_list_rooms      - List available rooms
 *   acg_get_messages    - Get messages from a room
 *   acg_create_room     - Create a new room
 *   acg_search_messages - Search messages by content
 *   acg_export_data     - Export all data
 *   acg_get_tags        - Get ISA-95 tag instances
 *   acg_render_doc      - Render a markdown template
 */
import { MemoryStore } from '../api/server.js';
import { parsePath, resolvePath } from '../../path/index.js';

const store = new MemoryStore();

const TOOL_DEFINITIONS = [
  {
    name: 'acg_send_message',
    description: 'Send a message to an ACG Chat room channel',
    inputSchema: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Room ID' },
        channel: { type: 'string', description: 'Channel key (NEU, NED, etc.)', default: 'NEU' },
        content: { type: 'string', description: 'Message content' },
        aiAssisted: { type: 'boolean', description: 'Mark as AI-assisted', default: true },
      },
      required: ['room', 'content'],
    },
  },
  {
    name: 'acg_list_rooms',
    description: 'List all available ACG Chat rooms',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'acg_get_messages',
    description: 'Get recent messages from a room channel',
    inputSchema: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Room ID' },
        channel: { type: 'string', default: 'NEU' },
        limit: { type: 'number', default: 50 },
      },
      required: ['room'],
    },
  },
  {
    name: 'acg_create_room',
    description: 'Create a new ACG Chat room',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', default: '' },
      },
      required: ['name'],
    },
  },
  {
    name: 'acg_search_messages',
    description: 'Search messages by content substring',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        room: { type: 'string', description: 'Optional room filter' },
        limit: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'acg_export_data',
    description: 'Export all ACG Chat data',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'acg_resolve_path',
    description: 'Resolve an ISA-95 tag path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'ISA-95 path (e.g. Enterprise/Site/Area)' },
      },
      required: ['path'],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'acg_send_message':
      return await store.sendMessage(args);

    case 'acg_list_rooms':
      return await store.getRooms();

    case 'acg_get_messages':
      return await store.getMessages(args.room, args.channel || 'NEU', args.limit || 50);

    case 'acg_create_room':
      return await store.createRoom(args);

    case 'acg_search_messages': {
      const all = store.messages.filter(m =>
        m.content.toLowerCase().includes(args.query.toLowerCase()) &&
        (!args.room || m.room === args.room)
      );
      return all.slice(-args.limit || -20);
    }

    case 'acg_export_data':
      return await store.exportAll();

    case 'acg_resolve_path':
      return resolvePath(args.path);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * MCP stdio transport: reads JSON-RPC from stdin, writes to stdout.
 */
async function startStdioServer() {
  console.error('[MCP] ACG MCP Server starting (stdio)...');

  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    processBuffer();
  });

  function processBuffer() {
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handleMessage(msg);
      } catch (err) {
        console.error('[MCP] Parse error:', err.message);
      }
    }
  }

  async function handleMessage(msg) {
    const { id, method, params } = msg;

    try {
      let result;

      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'acg-mcp', version: '1.0.0' },
          };
          break;

        case 'tools/list':
          result = { tools: TOOL_DEFINITIONS };
          break;

        case 'tools/call': {
          const toolResult = await handleToolCall(params.name, params.arguments || {});
          result = {
            content: [{
              type: 'text',
              text: JSON.stringify(toolResult, null, 2),
            }],
          };
          break;
        }

        case 'notifications/initialized':
          console.error('[MCP] Client initialized');
          return; // no response for notifications

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      send({ jsonrpc: '2.0', id, result });
    } catch (err) {
      send({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
    }
  }

  function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
  }
}

export async function run() {
  await startStdioServer();
}

export default run;
