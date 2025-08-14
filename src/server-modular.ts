// Personal KG MCP Server - Modular Architecture
// This is the new modular server that uses the modular tool structure

import { config } from "dotenv";
config({ path: ".env" });
config({ path: "../../.env" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// Provide a CommonJS require in ESM context for hosts that expect it
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).require = require;

import { FileStorage } from "./storage/FileStorage.js";
import { AnnIndex } from "./utils/ann.js";
import { embedText } from "./utils/embeddings.js";
import { buildTagCooccurrence } from "./utils/tagstats.js";

// Import modular tool setup functions
import { setupCoreTools } from "./tools/core.js";
import { setupSearchTools } from "./tools/search.js";
import { setupRelationshipTools } from "./tools/relationships.js";
import { setupMaintenanceTools } from "./tools/maintenance.js";
import { setupAnalysisTools } from "./tools/analysis.js";
import { setupProjectTools } from "./tools/project.js";
import { setupDeprecatedTools } from "./tools/deprecated.js";

export const PERSONAL_KG_TOOLS = ["kg_health", "kg_capture"] as const;

export function createPersonalKgServer(): McpServer {
  const server = new McpServer({ name: "personal-kg-mcp", version: "0.1.0" });
  const storage = new FileStorage({
    baseDir: process.env.PKG_STORAGE_DIR ?? ".kg",
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

  // Setup modular tools
  setupCoreTools(server, storage, ann, USE_ANN, EMBED_DIM);
  setupSearchTools(server, storage, ann, USE_ANN, EMBED_DIM, tagCo);
  setupRelationshipTools(server, storage);
  setupMaintenanceTools(server, storage);
  setupAnalysisTools(server, storage);
  setupProjectTools(server, storage);
  setupDeprecatedTools(server, storage);

  return server;
}

async function main() {
  const server = createPersonalKgServer();
  // Optional auto-backup scheduler controlled by env
  const minutes = Number(process.env.PKG_AUTO_BACKUP_MINUTES ?? "0");
  const retention = Number(process.env.PKG_BACKUP_RETENTION_DAYS ?? "30");
  if (Number.isFinite(minutes) && minutes > 0) {
    const storageForBackup = new FileStorage({
      baseDir: process.env.PKG_STORAGE_DIR ?? ".kg",
    });
    setInterval(
      () => {
        try {
          storageForBackup.backup(Number.isFinite(retention) ? retention : 30);
        } catch {
          // ignore scheduler errors
        }
      },
      minutes * 60 * 1000,
    );
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
