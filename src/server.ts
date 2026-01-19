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
import { initOpenAI, isOpenAIAvailable, getEmbeddingModel } from "./utils/openai-embeddings.js";
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

  // Initialize OpenAI for semantic embeddings (optional)
  const openaiInitialized = initOpenAI();
  if (openaiInitialized) {
    console.error(`[PKG] OpenAI embeddings enabled using ${getEmbeddingModel()}`);
  } else {
    console.error('[PKG] OpenAI not configured - using local bag-of-words embeddings');
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

  // Levenshtein distance for fuzzy matching
  function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  }

  // Cache of existing prefixed tags (refreshed periodically)
  let prefixedTagsCache: Set<string> = new Set();
  let lastTagCacheRefresh = 0;
  const TAG_CACHE_TTL = 60000; // 1 minute

  function refreshTagCache(): void {
    const now = Date.now();
    if (now - lastTagCacheRefresh < TAG_CACHE_TTL) return;

    prefixedTagsCache.clear();
    for (const node of storage.listAllNodes()) {
      for (const tag of node.tags) {
        if (tag.startsWith("proj:") || tag.startsWith("ws:") || tag.startsWith("ticket:")) {
          prefixedTagsCache.add(tag);
        }
      }
    }
    lastTagCacheRefresh = now;
  }

  // Find similar existing tag with given prefix
  function findSimilarTag(normalized: string, prefix: string, maxDistance = 3): string | null {
    refreshTagCache();

    const existingTags = Array.from(prefixedTagsCache).filter(t => t.startsWith(prefix));
    const fullTag = `${prefix}${normalized}`;

    // Exact match - return as-is
    if (existingTags.includes(fullTag)) return fullTag;

    // Find closest match within threshold
    let bestMatch: string | null = null;
    let bestDistance = maxDistance + 1;

    for (const existing of existingTags) {
      const existingName = existing.slice(prefix.length);
      const distance = levenshteinDistance(normalized, existingName);
      if (distance <= maxDistance && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = existing;
      }
    }

    if (bestMatch) {
      console.error(`[PKG] Fuzzy match: "${fullTag}" → "${bestMatch}" (distance: ${bestDistance})`);
    }

    return bestMatch;
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
    if (project && project.trim()) {
      const normalized = normalizeTagString(project);
      const existing = findSimilarTag(normalized, "proj:");
      set.add(existing ?? `proj:${normalized}`);
    }
    if (workstream && workstream.trim()) {
      const normalized = normalizeTagString(workstream);
      const existing = findSimilarTag(normalized, "ws:");
      set.add(existing ?? `ws:${normalized}`);
    }
    if (ticket && ticket.trim()) {
      const normalized = normalizeTagString(ticket);
      const existing = findSimilarTag(normalized, "ticket:");
      set.add(existing ?? `ticket:${normalized}`);
    }
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
