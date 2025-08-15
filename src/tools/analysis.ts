// Analysis Personal KG MCP Tools
// Contains analysis and graph exploration tools

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { embedText, cosineSimilarity } from "../utils/embeddings.js";

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
  // Detect topic clusters
  server.tool(
    "kg_detect_topic_clusters",
    "Identifies groups of related knowledge nodes using similarity analysis. Use to discover themes, workstreams, or conceptual clusters in your knowledge base.",
    {
      limit: z.number().int().min(1).max(10000).default(500).describe("Maximum number of nodes to analyze for clustering (higher = more comprehensive but slower)"),
      threshold: z.number().min(0).max(1).default(0.55).describe("Similarity threshold for grouping nodes (higher = more strict clustering, lower = broader groups)"),
    },
    async ({ limit, threshold }) => {
      logToolCall("kg_detect_topic_clusters", { limit, threshold });
      const nodes = storage.listAllNodes().slice(0, limit);
      const clusters: Array<{ id: string; nodes: string[]; centroid: string }> = [];
      
      // Simple clustering based on content similarity
      const processed = new Set<string>();
      for (const node of nodes) {
        if (processed.has(node.id)) continue;
        
        const cluster = [node.id];
        processed.add(node.id);
        
        for (const otherNode of nodes) {
          if (processed.has(otherNode.id)) continue;
          
          const similarity = cosineSimilarity(
            embedText(node.content),
            embedText(otherNode.content)
          );
          
          if (similarity >= threshold) {
            cluster.push(otherNode.id);
            processed.add(otherNode.id);
          }
        }
        
        if (cluster.length > 1) {
          clusters.push({
            id: `cluster_${clusters.length}`,
            nodes: cluster,
            centroid: node.content.slice(0, 100)
          });
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: clusters.length, clusters }, null, 2),
          },
        ],
      };
    },
  );

  // Find emerging concepts
  server.tool(
    "kg_find_emerging_concepts",
    "Identifies new or emerging topics based on recent activity patterns. Use to spot trends, new work areas, or evolving concepts in your knowledge base.",
    {
      limit: z.number().int().min(1).max(10000).default(500).describe("Maximum number of nodes to analyze for emerging concepts"),
      windowDays: z.number().int().min(1).max(90).default(7).describe("Time window in days to consider for 'recent' activity (higher = longer trend analysis)"),
    },
    async ({ limit, windowDays }) => {
      logToolCall("kg_find_emerging_concepts", { limit, windowDays });
      const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
      const recentNodes = storage.listAllNodes()
        .filter(n => new Date(n.createdAt).getTime() > cutoff)
        .slice(0, limit);
      
      // Simple emerging concept detection based on tag frequency
      const tagCounts: Record<string, number> = {};
      for (const node of recentNodes) {
        for (const tag of node.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      
      const emerging = Object.entries(tagCounts)
        .filter(([_, count]) => count >= 2)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: emerging.length, emerging }, null, 2),
          },
        ],
      };
    },
  );

  // Export complete knowledge graph structure
  server.tool(
    "kg_graph_export",
    "Exports the complete knowledge graph structure for external analysis or visualization. Use to create backups, share knowledge graphs, or perform external analysis.",
    {},
    async () => {
      logToolCall("kg_graph_export");
      const nodes = storage.listAllNodes();
      const edges = storage.listEdges();
      
      // Create graph structure with metadata
      const graphStructure = {
        metadata: {
          totalNodes: nodes.length,
          totalEdges: edges.length,
          exportedAt: new Date().toISOString(),
          version: "2.0"
        },
        nodes: nodes.map(node => ({
          id: node.id,
          type: node.type,
          content: node.content,
          tags: node.tags,
          visibility: node.visibility,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          importance: node.importance,
          git: node.git
        })),
        edges: edges.map(edge => ({
          id: edge.id,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          relation: edge.relation,
          createdAt: edge.createdAt,
          strength: edge.strength,
          confidence: edge.confidence,
          evidence: edge.evidence
        })),
        statistics: {
          nodeTypes: nodes.reduce((acc, node) => {
            acc[node.type] = (acc[node.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          relationTypes: edges.reduce((acc, edge) => {
            acc[edge.relation] = (acc[edge.relation] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          averageStrength: edges.length > 0 
            ? edges.reduce((sum, edge) => sum + (edge.strength || 0), 0) / edges.length 
            : 0
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(graphStructure, null, 2),
          },
        ],
      };
    },
  );

  // Find connection path
  server.tool(
    "kg_find_connection_path",
    "Finds the shortest path between two knowledge nodes through their relationships. Use to discover how different ideas or work items are connected in the knowledge graph.",
    {
      startId: z.string().describe("ID of the starting knowledge node"),
      endId: z.string().describe("ID of the target knowledge node to find path to"),
      maxDepth: z.number().int().min(1).max(6).default(4).describe("Maximum number of relationship hops to search (higher = broader search but slower)"),
    },
    async ({ startId, endId, maxDepth }) => {
      logToolCall("kg_find_connection_path", { startId, endId, maxDepth });
      const edges = storage.listEdges();
      
      // Simple path finding using BFS
      const graph: Record<string, string[]> = {};
      for (const edge of edges) {
        if (!graph[edge.fromNodeId]) graph[edge.fromNodeId] = [];
        if (!graph[edge.toNodeId]) graph[edge.toNodeId] = [];
        graph[edge.fromNodeId].push(edge.toNodeId);
        graph[edge.toNodeId].push(edge.fromNodeId);
      }
      
      const queue: Array<{ node: string; path: string[] }> = [{ node: startId, path: [startId] }];
      const visited = new Set<string>();
      
      while (queue.length > 0) {
        const { node, path } = queue.shift()!;
        
        if (node === endId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ path, length: path.length }, null, 2),
              },
            ],
          };
        }
        
        if (visited.has(node) || path.length > maxDepth) continue;
        visited.add(node);
        
        for (const neighbor of graph[node] || []) {
          if (!visited.has(neighbor)) {
            queue.push({ node: neighbor, path: [...path, neighbor] });
          }
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ path: [], length: 0, message: "No path found" }, null, 2),
          },
        ],
      };
    },
  );
}
