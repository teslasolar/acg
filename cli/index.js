#!/usr/bin/env node
/**
 * ACG CLI - Command dispatcher
 * Routes commands to the appropriate wrapper module.
 *
 * Usage:
 *   node cli/index.js <command> [args...]
 *
 * Commands:
 *   api       - Backend API wrapper (REST-like interface to chat functions)
 *   test      - Run test suites for all components
 *   mcp       - MCP server wrapper (Model Context Protocol)
 *   mqtt      - MQTT pub/sub wrapper for IoT integration
 *   whiteboard - Whiteboard command palette
 *   path      - Path/UDT/tag management
 *   render    - Markdown doc rendering
 */

const COMMANDS = {
  api:        () => import('./api/server.js'),
  test:       () => import('./test/runner.js'),
  mcp:        () => import('./mcp/server.js'),
  mqtt:       () => import('./mqtt/client.js'),
  whiteboard: () => import('./whiteboard/commands.js'),
  path:       () => import('../path/index.js'),
  render:     () => import('../docs/renderer.js'),
};

async function main() {
  const [,, cmd, ...args] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(`
ACG CLI - Autonomous Craftsperson Guild

Commands:
  api [port]        Start API server (default: 3000)
  test [filter]     Run tests (optional: filter by module name)
  mcp               Start MCP server (stdio)
  mqtt [broker]     Connect MQTT client
  whiteboard <cmd>  Execute whiteboard command
  path <subcommand> Path/UDT/tag management
  render [pattern]  Render markdown templates

Options:
  --help            Show this help
  --version         Show version
`);
    return;
  }

  if (cmd === '--version') {
    console.log('acg-cli 1.0.0');
    return;
  }

  const loader = COMMANDS[cmd];
  if (!loader) {
    console.error(`Unknown command: ${cmd}`);
    console.error(`Run "node cli/index.js --help" for available commands`);
    process.exit(1);
  }

  try {
    const mod = await loader();
    if (mod.default) {
      await mod.default(args);
    } else if (mod.run) {
      await mod.run(args);
    }
  } catch (err) {
    console.error(`[${cmd}] Error:`, err.message);
    process.exit(1);
  }
}

main();
