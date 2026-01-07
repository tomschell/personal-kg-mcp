// Search Personal KG MCP Tools
// Contains all search-related tools for finding and retrieving knowledge nodes

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { KnowledgeNodeType } from "../types/enums.js";
import { formatNodes, type FormatOptions } from "../utils/format.js";
import { embedText, cosineSimilarity, tokenize } from "../utils/embeddings.js";
import { reconstructContext } from "../utils/context.js";
import { expandTags } from "../utils/tagstats.js";

// Helper functions
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
      // IMPORTANT: write logs to stderr to avoid corrupting MCP stdio JSON
      console.error(`[PKG] ${now} tool=${name} args=${JSON.stringify(preview)}`);
    } else {
      // IMPORTANT: write logs to stderr to avoid corrupting MCP stdio JSON
      console.error(`[PKG] ${now} tool=${name}`);
    }
  } catch {
    // ignore logging failures
  }
}

export function setupSearchTools(
  server: McpServer,
  storage: FileStorage,
  ann: any, // TODO: Type this properly
  USE_ANN: boolean,
  EMBED_DIM: number,
  tagCo: any // TODO: Type this properly
): void {
  // Search nodes
  server.tool(
    "kg_search",
    {
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      type: z.enum(KnowledgeNodeType).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      format: z.enum(["full", "summary", "minimal"]).optional(),
      includeContent: z.boolean().optional(),
      includeTags: z.boolean().optional(),
      includeMetadata: z.boolean().optional(),
      summaryLength: z.number().int().min(1).max(2000).optional(),
    },
    async ({ query, tags, type, limit, format, includeContent, includeTags, includeMetadata, summaryLength }) => {
      logToolCall("kg_search", { query, tags, type, limit, format, includeContent, includeTags, includeMetadata, summaryLength });
      const all = storage.searchNodes({ query, tags, type, limit: 200 });
      // Rank blend: semantic (if query), tag overlap (if tags provided), recency
      const now = Date.now();
      const qVec = query ? embedText(query, EMBED_DIM) : undefined;
      const baseTags = (tags ?? []).map((t) => t.toLowerCase());
      const scored = all.map((n) => {
        const sem = qVec ? cosineSimilarity(qVec, embedText(n.content, EMBED_DIM)) : 0;
        const nTags = new Set(n.tags.map((t) => t.toLowerCase()));
        let tagOverlap = 0;
        if (baseTags.length > 0) for (const t of baseTags) if (nTags.has(t)) tagOverlap += 1;
        if (baseTags.length > 0) tagOverlap /= baseTags.length;
        const ageDays = Math.max(0, (now - Date.parse(n.updatedAt || n.createdAt)) / (1000 * 60 * 60 * 24));
        const recency = Math.max(0, 1 - ageDays / 30);
        const score = sem * 0.6 + tagOverlap * 0.25 + recency * 0.15;
        return { node: n, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const nodes = scored.slice(0, limit).map((s) => s.node);
      const fmt: FormatOptions = { format, includeContent, includeTags, includeMetadata, summaryLength };
      const payload = { total: nodes.length, nodes: formatNodes(nodes, fmt) } as const;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
        structuredContent: payload,
      };
    },
  );

  // Semantic search
  server.tool(
    "kg_semantic_search",
    "Performs AI-powered semantic search using vector similarity. Finds knowledge nodes based on meaning and context rather than exact keywords. Returns most conceptually similar results ranked by relevance.",
    { query: z.string()
        .describe("Natural language search query. Be descriptive - this uses AI to find semantically similar content, not just keyword matches."),
      limit: z.number().int().min(1).max(50).default(10)
        .describe("Maximum number of results to return. More results = broader coverage but less relevance."),
      threshold: z.number().min(0).max(1).default(0.15).optional()
        .describe("Minimum similarity score (0-1) for results. Higher = more strict. Default: 0.15"),
      hybridMode: z.boolean().default(false).optional()
        .describe("Enable hybrid search combining semantic similarity with tag matching and term presence. Default: false") },
    async ({ query, limit, threshold = 0.15, hybridMode = false }) => {
      logToolCall("kg_semantic_search", { query, limit, threshold, hybridMode });
      const q = embedText(query, EMBED_DIM);

      // Extract query tokens for hybrid search
      const queryTokens = hybridMode ? new Set(tokenize(query)) : null;

      let results: Array<{ id: string; score: number; snippet: string }> = [];
      if (USE_ANN && !hybridMode) {
        // ANN path - only for pure semantic search
        const top = ann.search(q, limit * 3);
        const nodesById = new Map(storage.listAllNodes().map((n) => [n.id, n] as const));
        results = top
          .map(({ id, score }: { id: string; score: number }) => ({ id, score, node: nodesById.get(id) }))
          .filter((r: { id: string; score: number; node: any }) => r.node && r.score >= threshold)
          .slice(0, limit)
          .map((r: { id: string; score: number; node: any }) => ({ id: r.id, score: r.score, snippet: r.node!.content.slice(0, 160) }));
      } else {
        const nodes = storage.listAllNodes();
        const scored = nodes.map((n) => {
          const semScore = cosineSimilarity(q, embedText(n.content, EMBED_DIM));

          if (!hybridMode || !queryTokens) {
            // Pure semantic search
            return { node: n, score: semScore };
          }

          // Hybrid search: combine semantic + tag matching + term presence

          // Tag matching: check if any node tags match query tokens
          const nodeTags = new Set(n.tags.map(t => t.toLowerCase()));
          let tagMatchScore = 0;
          for (const token of queryTokens) {
            if (nodeTags.has(token)) {
              tagMatchScore += 1;
            }
          }
          if (queryTokens.size > 0) {
            tagMatchScore /= queryTokens.size;
          }

          // Term presence: check if query tokens appear in content
          const contentTokens = new Set(tokenize(n.content));
          let termPresenceScore = 0;
          for (const token of queryTokens) {
            if (contentTokens.has(token)) {
              termPresenceScore += 1;
            }
          }
          if (queryTokens.size > 0) {
            termPresenceScore /= queryTokens.size;
          }

          // Weighted combination: 70% semantic, 20% tag match, 10% term presence
          const hybridScore = semScore * 0.7 + tagMatchScore * 0.2 + termPresenceScore * 0.1;

          return { node: n, score: hybridScore };
        });

        scored.sort((a, b) => b.score - a.score);
        results = scored
          .filter((r) => r.score >= threshold)
          .slice(0, limit)
          .map((r) => ({
            id: r.node.id,
            score: r.score,
            snippet: r.node.content.slice(0, 160),
          }));
      }
      const payload = { total: results.length, results };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  // Find similar nodes
  server.tool(
    "kg_find_similar",
    { nodeId: z.string(),
      limit: z.number().int().min(1).max(50).default(10),
      threshold: z.number().min(0).max(1).default(0.15).optional()
        .describe("Minimum similarity score (0-1) for results. Higher = more strict. Default: 0.15") },
    async ({ nodeId, limit, threshold = 0.15 }) => {
      logToolCall("kg_find_similar", { nodeId, limit, threshold });
      const base = storage.getNode(nodeId);
      if (!base)
        return {
          content: [
            { type: "text", text: JSON.stringify({ results: [] }, null, 2) },
          ],
        };
      const v = embedText(base.content);
      const nodes = storage.listAllNodes().filter((n) => n.id !== nodeId);
      const scored = nodes.map((n) => ({
        node: n,
        score: cosineSimilarity(v, embedText(n.content)),
      }));
      scored.sort((a, b) => b.score - a.score);
      const results = scored
        .filter((r) => r.score >= threshold)
        .slice(0, limit)
        .map((r) => ({
          id: r.node.id,
          score: r.score,
          snippet: r.node.content.slice(0, 160),
        }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: results.length, results }, null, 2),
          },
        ],
      };
    },
  );

  // Time range query
  server.tool(
    "kg_query_time_range",
    "Searches for knowledge nodes within a specific time period. Use to find work done during particular dates or to analyze activity patterns over time.",
    {
      start: z.string().optional()
        .describe("Start date/time for the search range (e.g., '2024-01-01', '2 weeks ago')"),
      end: z.string().optional()
        .describe("End date/time for the search range (e.g., '2024-12-31', 'today')"),
      query: z.string().optional()
        .describe("Optional text query to filter nodes within the time range"),
    },
    async ({ start, end, query }) => {
      logToolCall("kg_query_time_range", { start, end, query });
      const nodes = storage.listByTimeRange({ start, end, query });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: nodes.length, nodes }, null, 2),
          },
        ],
      };
    },
  );

  // Context query
  server.tool(
    "kg_query_context",
    "Reconstructs context around a specific topic by analyzing related knowledge nodes. Use to understand the full context and background of a particular subject area.",
    { 
      topic: z.string()
        .describe("Topic or subject area to reconstruct context for (e.g., 'deployment', 'api-design', 'bug-fix')")
    },
    async ({ topic }) => {
      logToolCall("kg_query_context", { topic });
      const nodes = storage.listAllNodes();
      const summary = reconstructContext(nodes, topic);
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    },
  );
}
