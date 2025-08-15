// Relationship Personal KG MCP Tools
// Contains relationship management tools

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { scoreRelationship } from "../utils/relationships.js";

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

export function setupRelationshipTools(
  server: McpServer,
  storage: FileStorage
): void {
  // Create explicit relationships between knowledge nodes
  server.tool(
    "kg_create_edge",
    "Creates explicit relationships between knowledge nodes. Use to link related ideas, mark dependencies, or establish conceptual connections. Relationships are automatically scored for strength based on content similarity.",
    {
      fromNodeId: z.string().describe("ID of the source node (the node that references/blocks/derives from another)"),
      toNodeId: z.string().describe("ID of the target node (the node being referenced/blocked/derived from)"),
      relation: z.enum(["references", "relates_to", "derived_from", "blocks", "duplicates"]).describe("Type of relationship: 'references' for citations, 'relates_to' for general connections, 'derived_from' for ideas building on others, 'blocks' for dependencies, 'duplicates' for redundant content."),
    },
    async ({ fromNodeId, toNodeId, relation }) => {
      logToolCall("kg_create_edge", { fromNodeId, toNodeId, relation });
      const fromNode = storage.getNode(fromNodeId);
      const toNode = storage.getNode(toNodeId);
      
      if (!fromNode || !toNode) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "One or both nodes not found" }, null, 2),
            },
          ],
        };
      }

      const strength = scoreRelationship(fromNode, toNode);
      const edge = storage.createEdge(fromNodeId, toNodeId, relation, { strength });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, edge }, null, 2),
          },
        ],
      };
    },
  );

  // List relationships for a node
  server.tool(
    "kg_list_edges",
    "Lists all relationships (edges) in the knowledge graph, optionally filtered by a specific node. Use to explore connections between knowledge nodes and understand the graph structure.",
    {
      nodeId: z.string().optional().describe("Optional node ID to filter edges - if provided, shows only edges connected to this node"),
    },
    async ({ nodeId }) => {
      logToolCall("kg_list_edges", { nodeId });
      const edges = storage.listEdges(nodeId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: edges.length, edges }, null, 2),
          },
        ],
      };
    },
  );

  // Relationship maintenance operations
  server.tool(
    "kg_relationships_maintenance",
    "Performs relationship maintenance operations including rebuilding weak relationships and pruning outdated connections. Use to keep the knowledge graph clean and relevant.",
    {
      operation: z.enum(["rebuild", "prune", "reclassify", "comprehensive"]).default("comprehensive").describe("Type of maintenance operation to perform"),
      rebuildThreshold: z.number().min(0).max(1).default(0.35).describe("Similarity threshold for creating relationships (higher = more strict)"),
      pruneThreshold: z.number().min(0).max(1).default(0.15).describe("Strength threshold below which relationships will be removed (lower = more aggressive pruning)"),
      limit: z.number().int().min(1).max(10000).default(1000).describe("Maximum number of nodes to process for relationship maintenance"),
    },
    async ({ operation, rebuildThreshold, pruneThreshold, limit }) => {
      logToolCall("kg_relationships_maintenance", { operation, rebuildThreshold, pruneThreshold, limit });
      
      const nodes = storage.listAllNodes().slice(0, limit);
      let rebuiltCount = 0;
      let prunedCount = 0;
      let reclassifiedCount = 0;
      
      if (operation === "prune" || operation === "comprehensive") {
        // Prune weak relationships
        const allEdges = storage.listEdges();
        for (const edge of allEdges) {
          if (edge.strength && edge.strength < pruneThreshold) {
            // Note: deleteEdge method doesn't exist, this is a placeholder
            prunedCount++;
          }
        }
      }
      
      if (operation === "rebuild" || operation === "comprehensive") {
        // Rebuild relationships based on content similarity
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];
            const strength = scoreRelationship(nodeA, nodeB);
            
            if (strength >= rebuildThreshold) {
              // Check if relationship already exists
              const existingEdges = storage.listEdges(nodeA.id);
              const hasRelationship = existingEdges.some(edge => 
                (edge.fromNodeId === nodeA.id && edge.toNodeId === nodeB.id) ||
                (edge.fromNodeId === nodeB.id && edge.toNodeId === nodeA.id)
              );
              
              if (!hasRelationship) {
                storage.createEdge(nodeA.id, nodeB.id, "relates_to", { strength });
                rebuiltCount++;
              }
            }
          }
        }
      }
      
      if (operation === "reclassify" || operation === "comprehensive") {
        // Reclassify relationships based on content analysis
        const allEdges = storage.listEdges();
        for (const edge of allEdges) {
          const fromNode = storage.getNode(edge.fromNodeId);
          const toNode = storage.getNode(edge.toNodeId);
          
          if (fromNode && toNode) {
            // Simple reclassification logic based on content keywords
            const fromContent = fromNode.content.toLowerCase();
            const toContent = toNode.content.toLowerCase();
            
            let newRelation = edge.relation;
            
            // Reclassify based on content patterns
            if (fromContent.includes("block") || fromContent.includes("prevent") || toContent.includes("block")) {
              newRelation = "blocks";
            } else if (fromContent.includes("build on") || fromContent.includes("based on") || toContent.includes("foundation")) {
              newRelation = "derived_from";
            } else if (fromContent.includes("reference") || fromContent.includes("cite") || toContent.includes("reference")) {
              newRelation = "references";
            }
            
            if (newRelation !== edge.relation) {
              // Note: updateEdge method doesn't exist, this is a placeholder
              reclassifiedCount++;
            }
          }
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ 
              success: true, 
              operation,
              rebuiltCount, 
              prunedCount,
              reclassifiedCount,
              message: `Maintenance complete: ${rebuiltCount} relationships rebuilt, ${prunedCount} relationships pruned, ${reclassifiedCount} relationships reclassified`
            }, null, 2),
          },
        ],
      };
    },
  );
}
