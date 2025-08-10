import { config } from "dotenv";
config({ path: ".env" });
config({ path: "../../.env" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ImportanceLevel, KnowledgeNodeType } from "./types/enums.js";
import { getHealth } from "./handlers/health.js";
import { FileStorage } from "./storage/FileStorage.js";
import type { CreateNodeInput } from "./types/domain.js";
import { findAutoLinks } from "./utils/autoLink.js";
import { cosineSimilarity, embedText } from "./utils/embeddings.js";
import { reconstructContext } from "./utils/context.js";
import { scoreRelationship } from "./utils/relationships.js";

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
  function toolSafe<Schema extends Record<string, any>>(
    name: string,
    schema: Schema,
    handler: (args: any) => Promise<any> | any
  ) {
    server.tool(name, schema as any, async (args: any) => {
      try {
        const result = await handler(args);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { content: [{ type: "text", text: JSON.stringify({ error: true, name, message }, null, 2) }] };
      }
    });
  }

  toolSafe(
    PERSONAL_KG_TOOLS[1],
    {
      content: z.string(),
      type: z.enum(KnowledgeNodeType).default("idea"),
      tags: z.array(z.string()).optional(),
      visibility: z.enum(["private", "team", "public"]).optional(),
      includeGit: z.boolean().default(false),
      importance: z.enum(ImportanceLevel).default("medium"),
      auto_link: z.boolean().default(true)
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
      const input: CreateNodeInput = { content: args.content, type: args.type, tags: args.tags ?? [], visibility: args.visibility, git, importance: args.importance };
      const node = storage.createNode(input);
      // optional auto-link
      if (args.auto_link) {
        const candidates = storage.searchNodes({ limit: 50 });
        const links = findAutoLinks(candidates, node.content);
        for (const id of links) {
          const other = storage.getNode(id);
          const strength = other ? scoreRelationship(node, other) : undefined;
          storage.createEdge(node.id, id, "relates_to", { strength, evidence: ["tags/content overlap"] });
        }
      }
      return { content: [{ type: "text", text: JSON.stringify({ accepted: true, node }, null, 2) }] };
    }
  );

  toolSafe(
    "kg_capture_session",
    {
      summary: z.string(),
      duration: z.string().optional(),
      artifacts: z.array(z.string()).optional(),
      next_actions: z.array(z.string()).optional(),
      visibility: z.enum(["private", "team", "public"]).optional(),
      importance: z.enum(ImportanceLevel).default("medium"),
    },
    async ({ summary, duration, artifacts, next_actions, visibility, importance }) => {
      const content = [
        `Session Summary: ${summary}`,
        duration ? `Duration: ${duration}` : undefined,
        artifacts?.length ? `Artifacts: ${artifacts.join(", ")}` : undefined,
        next_actions?.length ? `Next Actions: ${next_actions.join("; ")}` : undefined,
      ]
        .filter(Boolean)
        .join("\n");
      const node = storage.createNode({ content, type: "session", tags: ["session"], visibility, importance });
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
      const a = storage.getNode(fromNodeId);
      const b = storage.getNode(toNodeId);
      const strength = a && b ? scoreRelationship(a, b) : undefined;
      const edge = storage.createEdge(fromNodeId, toNodeId, relation, { strength });
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
    "kg_rebuild_relationships",
    { threshold: z.number().min(0).max(1).default(0.35), limit: z.number().int().min(1).max(10000).default(1000) },
    async ({ threshold, limit }) => {
      const nodes = storage.listAllNodes().slice(0, limit);
      let created = 0;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const s = scoreRelationship(nodes[i], nodes[j]);
          if (s >= threshold) {
            storage.createEdge(nodes[i].id, nodes[j].id, "relates_to", { strength: s });
            created++;
          }
        }
      }
      return { content: [{ type: "text", text: JSON.stringify({ created }, null, 2) }] };
    }
  );

  server.tool(
    "kg_prune_weak_relationships",
    { threshold: z.number().min(0).max(1).default(0.15) },
    async ({ threshold }) => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const edgesDir = (storage as any).edgesDir as string; // internal path
      let removed = 0;
      for (const f of fs.readdirSync(edgesDir)) {
        if (!f.endsWith(".json")) continue;
        const p = path.join(edgesDir, f);
        const e = JSON.parse(fs.readFileSync(p, "utf8"));
        if (typeof e.strength === "number" && e.strength < threshold) {
          fs.rmSync(p);
          removed++;
        }
      }
      return { content: [{ type: "text", text: JSON.stringify({ removed }, null, 2) }] };
    }
  );

  toolSafe(
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
    "kg_semantic_search",
    { query: z.string(), limit: z.number().int().min(1).max(50).default(10) },
    async ({ query, limit }) => {
      const q = embedText(query);
      const nodes = storage.listAllNodes();
      const scored = nodes.map((n) => ({ node: n, score: cosineSimilarity(q, embedText(n.content)) }));
      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, limit).map((r) => ({ id: r.node.id, score: r.score, snippet: r.node.content.slice(0, 160) }));
      return { content: [{ type: "text", text: JSON.stringify({ total: results.length, results }, null, 2) }] };
    }
  );

  server.tool(
    "kg_find_similar",
    { nodeId: z.string(), limit: z.number().int().min(1).max(50).default(10) },
    async ({ nodeId, limit }) => {
      const base = storage.getNode(nodeId);
      if (!base) return { content: [{ type: "text", text: JSON.stringify({ results: [] }, null, 2) }] };
      const v = embedText(base.content);
      const nodes = storage.listAllNodes().filter((n) => n.id !== nodeId);
      const scored = nodes.map((n) => ({ node: n, score: cosineSimilarity(v, embedText(n.content)) }));
      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, limit).map((r) => ({ id: r.node.id, score: r.score, snippet: r.node.content.slice(0, 160) }));
      return { content: [{ type: "text", text: JSON.stringify({ total: results.length, results }, null, 2) }] };
    }
  );

  server.tool(
    "kg_backup",
    { retentionDays: z.number().int().min(0).max(365).default(30) },
    async ({ retentionDays }) => {
      const res = storage.backup(retentionDays);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  server.tool(
    "kg_validate",
    {},
    async () => {
      const res = storage.validate();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  server.tool(
    "kg_repair",
    {},
    async () => {
      const res = storage.repair();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  server.tool(
    "kg_query_time_range",
    { start: z.string().optional(), end: z.string().optional(), query: z.string().optional() },
    async ({ start, end, query }) => {
      const nodes = storage.listByTimeRange({ start, end, query });
      return { content: [{ type: "text", text: JSON.stringify({ total: nodes.length, nodes }, null, 2) }] };
    }
  );

  server.tool(
    "kg_query_context",
    { topic: z.string() },
    async ({ topic }) => {
      const summary = reconstructContext(storage.listAllNodes(), topic);
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
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

  server.tool(
    "kg_delete_node",
    { id: z.string(), deleteEdges: z.boolean().default(true) },
    async ({ id, deleteEdges }) => {
      const deleted = storage.deleteNode(id);
      const edgesDeleted = deleteEdges ? storage.deleteEdgesForNode(id) : 0;
      return { content: [{ type: "text", text: JSON.stringify({ deleted, edgesDeleted }, null, 2) }] };
    }
  );

  return server;
}

async function main() {
  const server = createPersonalKgServer();
  // Optional auto-backup scheduler controlled by env
  const minutes = Number(process.env.PKG_AUTO_BACKUP_MINUTES ?? "0");
  const retention = Number(process.env.PKG_BACKUP_RETENTION_DAYS ?? "30");
  if (Number.isFinite(minutes) && minutes > 0) {
    const storageForBackup = new FileStorage({ baseDir: process.env.PKG_STORAGE_DIR ?? ".kg" });
    setInterval(() => {
      try {
        storageForBackup.backup(Number.isFinite(retention) ? retention : 30);
      } catch {
        // ignore scheduler errors
      }
    }, minutes * 60 * 1000);
  }
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


