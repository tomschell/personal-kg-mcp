import { config } from "dotenv";
config({ path: ".env" });
config({ path: "../../.env" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).require = require;

import { FileStorage } from "./storage/FileStorage.js";
import { AnnIndex } from "./utils/ann.js";
import { embedText } from "./utils/embeddings.js";
import { buildTagCooccurrence } from "./utils/tagstats.js";
import { setupAllTools } from "./tools/index.js";
import { getStoragePath, validateConfig } from "./config/KGConfig.js";

export function createPersonalKgServer(): McpServer {
  const server = new McpServer({ name: "personal-kg-mcp", version: "0.1.0" });
  
  // Load configuration and validate
  const storagePath = getStoragePath();
  const configIssues = validateConfig();
  
  if (configIssues.length > 0) {
    console.error('[PKG] Configuration issues found:', configIssues);
  }
  
  const storage = new FileStorage({
    baseDir: storagePath,
  });

  const USE_ANN = String(process.env.PKG_USE_ANN ?? "false").toLowerCase() === "true";
  const EMBED_DIM = 256;
  const ann = new AnnIndex(EMBED_DIM);
  
  if (USE_ANN) {
    try {
      const all = storage.listAllNodes();
      ann.build(
        all.map((n) => ({ id: n.id, vector: embedText(n.content, EMBED_DIM) })),
      );
      console.error(`[PKG] ANN index built for ${all.length} nodes`);
    } catch {}
  }
  
  let tagCo = buildTagCooccurrence(storage.listAllNodes());

  function normalizeTagString(s: string): string {
    return s.trim().replace(/\s+/g, "-").toLowerCase();
  }

  function normalizeTags(
    base: string[] | undefined,
    project?: string,
    workstream?: string,
    ticket?: string,
  ): string[] {
    const set = new Set<string>();
    for (const t of base ?? []) {
      if (typeof t === "string" && t.trim().length > 0) set.add(normalizeTagString(t));
    }
    if (project && project.trim()) set.add(`proj:${normalizeTagString(project)}`);
    if (workstream && workstream.trim()) set.add(`ws:${normalizeTagString(workstream)}`);
    if (ticket && ticket.trim()) set.add(`ticket:${normalizeTagString(ticket)}`);
    return Array.from(set);
  }

  function getWorkstreamTag(tags: string[]): string | undefined {
    return tags.find((t) => t.toLowerCase().startsWith("ws:"));
  }

  function logToolCall(name: string, args?: unknown): void {
    try {
      const now = new Date().toISOString();
      if (args && typeof args === "object") {
        const keys = Object.keys(args as Record<string, unknown>);
        const preview: Record<string, unknown> = {};
        for (const k of keys) {
          const v = (args as Record<string, unknown>)[k];
          if (typeof v === "string" && v.length <= 120) {
            preview[k] = v;
          } else if (typeof v === "number" || typeof v === "boolean" || v == null) {
            preview[k] = v as unknown;
          } else if (Array.isArray(v)) {
            preview[k] = `array(len=${v.length})`;
          } else if (typeof v === "object") {
            preview[k] = "object";
          }
        }
        console.error(`[PKG] ${now} tool=${name} args=${JSON.stringify(preview)}`);
      } else {
        console.error(`[PKG] ${now} tool=${name}`);
      }
    } catch {
      // ignore logging failures
    }
  }

  // Setup all tools using modular architecture
  setupAllTools(server, storage, ann, USE_ANN, EMBED_DIM, normalizeTags, getWorkstreamTag, logToolCall, tagCo);

  return server;
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createPersonalKgServer();
  const transport = new StdioServerTransport();
  server.connect(transport);
}

// Export the server creation function as default
export default createPersonalKgServer;
