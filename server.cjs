#!/usr/bin/env node
// CommonJS wrapper to launch the ESM MCP server for hosts that prefer require()
(async () => {
  const { createPersonalKgServer } = await import('./dist/server.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = createPersonalKgServer();
  await server.connect(new StdioServerTransport());
})();


