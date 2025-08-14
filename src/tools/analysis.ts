// Analysis Personal KG MCP Tools
// Contains clustering, emerging concepts, etc.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { buildGraphExport } from "../utils/graph.js";
import { clusterBySimilarity } from "../utils/clustering.js";
import { findEmergingConcepts } from "../utils/emerging.js";

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

export function setupAnalysisTools(
  server: McpServer,
  storage: FileStorage
): void {
  // Export complete knowledge graph structure
  server.tool(
    "kg_graph_export",
    "Exports the complete knowledge graph structure for external analysis or visualization. Use to create backups, share knowledge graphs, or perform external analysis.",
    {},
    async () => {
      logToolCall("kg_graph_export");
      const g = buildGraphExport(storage);
      return { content: [{ type: "text", text: JSON.stringify(g, null, 2) }] };
    },
  );

  // Detect topic clusters
  server.tool(
    "kg_detect_topic_clusters",
    "Identifies groups of related knowledge nodes using similarity analysis. Use to discover themes, workstreams, or conceptual clusters in your knowledge base.",
    { 
      limit: z.number().int().min(1).max(10000).default(500)
        .describe("Maximum number of nodes to analyze for clustering (higher = more comprehensive but slower)"),
      threshold: z.number().min(0).max(1).default(0.55)
        .describe("Similarity threshold for grouping nodes (higher = more strict clustering, lower = broader groups)")
    },
    async ({ limit, threshold }) => {
      logToolCall("kg_detect_topic_clusters", { limit, threshold });
      const nodes = storage.listAllNodes().slice(0, limit);
      const clusters = clusterBySimilarity(nodes, threshold);
      return { content: [{ type: "text", text: JSON.stringify({ total: clusters.length, clusters }, null, 2) }] };
    },
  );

  // Find emerging concepts
  server.tool(
    "kg_find_emerging_concepts",
    "Identifies new or emerging topics based on recent activity patterns. Use to spot trends, new work areas, or evolving concepts in your knowledge base.",
    { 
      limit: z.number().int().min(1).max(10000).default(500)
        .describe("Maximum number of nodes to analyze for emerging concepts"),
      windowDays: z.number().int().min(1).max(90).default(7)
        .describe("Time window in days to consider for 'recent' activity (higher = longer trend analysis)")
    },
    async ({ limit, windowDays }) => {
      logToolCall("kg_find_emerging_concepts", { limit, windowDays });
      const nodes = storage.listAllNodes().slice(0, limit);
      const concepts = findEmergingConcepts(nodes, windowDays);
      return { content: [{ type: "text", text: JSON.stringify({ total: concepts.length, concepts }, null, 2) }] };
    },
  );

  // General export (duplicate of maintenance tool for backward compatibility)
  server.tool(
    "kg_export",
    "Exports all knowledge graph data in a structured format. Use for backups, data migration, or external processing of your knowledge base.",
    {},
    async () => {
      logToolCall("kg_export");
      const payload = storage.exportAll();
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
}
