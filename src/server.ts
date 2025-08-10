import { config } from "dotenv";
config({ path: ".env" });
config({ path: "../../.env" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "personal-kg-mcp", version: "0.1.0" });

// Basic health tool
server.tool(
  "kg_health",
  {},
  async () => {
    return {
      content: [
        { type: "text", text: JSON.stringify({ status: "ok", name: "personal-kg-mcp" }) }
      ]
    };
  }
);

// Minimal placeholder: capture node (spec-driven to be expanded)
server.tool(
  "kg_capture",
  {
    content: z.string(),
    type: z.enum(["idea", "decision", "progress", "insight", "question"]).default("idea"),
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

await server.connect(new StdioServerTransport());


