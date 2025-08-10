import { config } from "dotenv";
config({ path: ".env" });
config({ path: "../../.env" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { KnowledgeNodeType } from "./types/enums.js";
import { getHealth } from "./handlers/health.js";

export const PERSONAL_KG_TOOLS = ["kg_health", "kg_capture"] as const;

export function createPersonalKgServer(): McpServer {
  const server = new McpServer({ name: "personal-kg-mcp", version: "0.1.0" });

  // Basic health tool
  server.tool(
    PERSONAL_KG_TOOLS[0],
    {},
    async () => {
      const { result } = getHealth();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  // Minimal placeholder: capture node (spec-driven to be expanded)
  server.tool(
    PERSONAL_KG_TOOLS[1],
    {
      content: z.string(),
      type: z.enum(KnowledgeNodeType).default("idea"),
      tags: z.array(z.string()).optional()
    },
    async (args) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              accepted: true,
              node: {
                id: `tmp_${Date.now()}`,
                content: args.content,
                type: args.type,
                tags: args.tags ?? []
              }
            }, null, 2)
          }
        ]
      };
    }
  );

  return server;
}

async function main() {
  const server = createPersonalKgServer();
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Run only when executed directly
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export type { McpServer };


