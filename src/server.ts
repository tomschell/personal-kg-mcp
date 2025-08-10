import { config } from "dotenv";
config({ path: ".env" });
config({ path: "../../.env" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { KnowledgeNodeType } from "./types/enums.js";
import { getHealth } from "./handlers/health.js";
import { FileStorage } from "./storage/FileStorage.js";
import type { CreateNodeInput } from "./types/domain.js";

export const PERSONAL_KG_TOOLS = ["kg_health", "kg_capture"] as const;

export function createPersonalKgServer(): McpServer {
  const server = new McpServer({ name: "personal-kg-mcp", version: "0.1.0" });
  const storage = new FileStorage({ baseDir: process.env.PKG_STORAGE_DIR ?? ".kg" });

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
      tags: z.array(z.string()).optional(),
      includeGit: z.boolean().default(false)
    },
    async (args) => {
      let git: CreateNodeInput["git"] | undefined;
      if (args.includeGit) {
        try {
          const { execSync } = await import("node:child_process");
          const branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
          const commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
          const repoPath = process.cwd();
          git = { repositoryPath: repoPath, currentBranch: branch, currentCommit: commit };
        } catch {
          // ignore git errors; leave git undefined
        }
      }
      const input: CreateNodeInput = { content: args.content, type: args.type, tags: args.tags ?? [], git };
      const node = storage.createNode(input);
      return { content: [{ type: "text", text: JSON.stringify({ accepted: true, node }, null, 2) }] };
    }
  );

  server.tool(
    "kg_get_node",
    { id: z.string() },
    async ({ id }) => {
      const node = storage.getNode(id);
      return { content: [{ type: "text", text: JSON.stringify({ node }, null, 2) }] };
    }
  );

  server.tool(
    "kg_list_recent",
    { limit: z.number().int().min(1).max(100).default(20) },
    async ({ limit }) => {
      const nodes = storage.listRecent(limit);
      return { content: [{ type: "text", text: JSON.stringify({ total: nodes.length, nodes }, null, 2) }] };
    }
  );

  server.tool(
    "kg_create_edge",
    { fromNodeId: z.string(), toNodeId: z.string(), relation: z.enum(["references", "relates_to", "derived_from", "blocks", "duplicates"]) },
    async ({ fromNodeId, toNodeId, relation }) => {
      const edge = storage.createEdge(fromNodeId, toNodeId, relation);
      return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    }
  );

  server.tool(
    "kg_list_edges",
    { nodeId: z.string().optional() },
    async ({ nodeId }) => {
      const edges = storage.listEdges(nodeId);
      return { content: [{ type: "text", text: JSON.stringify({ total: edges.length, edges }, null, 2) }] };
    }
  );

  server.tool(
    "kg_search",
    {
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      type: z.enum(KnowledgeNodeType).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ query, tags, type, limit }) => {
      const nodes = storage.searchNodes({ query, tags, type, limit });
      return { content: [{ type: "text", text: JSON.stringify({ total: nodes.length, nodes }, null, 2) }] };
    }
  );

  server.tool(
    "kg_export",
    {},
    async () => {
      const payload = storage.exportAll();
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    }
  );

  server.tool(
    "kg_import",
    { payload: z.string() },
    async ({ payload }) => {
      const data = JSON.parse(payload);
      const result = storage.importAll(data);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }, null, 2) }] };
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


