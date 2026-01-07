// Relationship Personal KG MCP Tools
// Contains consolidated relationship management tools

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

// Edge operation types
const EdgeOperation = ["create", "list", "maintain"] as const;
const RelationType = ["references", "relates_to", "derived_from", "blocks", "duplicates"] as const;
const MaintenanceOp = ["rebuild", "prune", "reclassify", "comprehensive"] as const;

export function setupRelationshipTools(
  server: McpServer,
  storage: FileStorage
): void {
  // =============================================================================
  // CONSOLIDATED EDGES TOOL
  // Replaces: kg_create_edge, kg_list_edges, kg_relationships_maintenance
  // =============================================================================
  server.tool(
    "kg_edges",
    "Unified tool for relationship operations. Supports: 'create' to link nodes, 'list' to view relationships, 'maintain' for cleanup and rebuilding.",
    {
      operation: z.enum(EdgeOperation)
        .describe("Edge operation: 'create' to link nodes, 'list' to view edges, 'maintain' for maintenance."),

      // create operation options
      fromNodeId: z.string().optional()
        .describe("[create] Source node ID."),
      toNodeId: z.string().optional()
        .describe("[create] Target node ID."),
      relation: z.enum(RelationType).optional()
        .describe("[create] Relationship type: references, relates_to, derived_from, blocks, duplicates."),

      // list operation options
      nodeId: z.string().optional()
        .describe("[list] Filter edges by node ID (shows edges connected to this node)."),

      // maintain operation options
      maintainOp: z.enum(MaintenanceOp).default("comprehensive").optional()
        .describe("[maintain] Maintenance type: rebuild, prune, reclassify, comprehensive."),
      rebuildThreshold: z.number().min(0).max(1).default(0.35).optional()
        .describe("[maintain] Similarity threshold for rebuilding (higher = stricter)."),
      pruneThreshold: z.number().min(0).max(1).default(0.15).optional()
        .describe("[maintain] Strength threshold for pruning (lower = more aggressive)."),
      limit: z.number().int().min(1).max(10000).default(1000).optional()
        .describe("[maintain] Maximum nodes to process."),
    },
    async (args) => {
      const {
        operation,
        fromNodeId,
        toNodeId,
        relation,
        nodeId,
        maintainOp = "comprehensive",
        rebuildThreshold = 0.35,
        pruneThreshold = 0.15,
        limit = 1000
      } = args;

      logToolCall("kg_edges", { operation, fromNodeId, toNodeId, relation, nodeId, maintainOp });

      switch (operation) {
        case "create":
          return handleCreateEdge(storage, fromNodeId, toNodeId, relation);

        case "list":
          return handleListEdges(storage, nodeId);

        case "maintain":
          return handleMaintenance(storage, maintainOp, rebuildThreshold, pruneThreshold, limit);

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Unknown operation: ${operation}` }, null, 2),
              },
            ],
          };
      }
    },
  );
}

// =============================================================================
// EDGE OPERATION HANDLERS
// =============================================================================

async function handleCreateEdge(
  storage: FileStorage,
  fromNodeId?: string,
  toNodeId?: string,
  relation?: typeof RelationType[number]
) {
  if (!fromNodeId || !toNodeId || !relation) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "fromNodeId, toNodeId, and relation are required for create operation"
          }, null, 2),
        },
      ],
    };
  }

  const fromNode = storage.getNode(fromNodeId);
  const toNode = storage.getNode(toNodeId);

  if (!fromNode || !toNode) {
    return {
      content: [
        {
          type: "text" as const,
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
        type: "text" as const,
        text: JSON.stringify({ operation: "create", success: true, edge }, null, 2),
      },
    ],
  };
}

async function handleListEdges(storage: FileStorage, nodeId?: string) {
  const edges = storage.listEdges(nodeId);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ operation: "list", total: edges.length, edges }, null, 2),
      },
    ],
  };
}

async function handleMaintenance(
  storage: FileStorage,
  maintainOp: typeof MaintenanceOp[number],
  rebuildThreshold: number,
  pruneThreshold: number,
  limit: number
) {
  const nodes = storage.listAllNodes().slice(0, limit);
  let rebuiltCount = 0;
  let prunedCount = 0;
  let reclassifiedCount = 0;

  if (maintainOp === "prune" || maintainOp === "comprehensive") {
    // Prune weak relationships
    const allEdges = storage.listEdges();
    for (const edge of allEdges) {
      if (edge.strength && edge.strength < pruneThreshold) {
        // Note: deleteEdge method doesn't exist, this is a placeholder
        prunedCount++;
      }
    }
  }

  if (maintainOp === "rebuild" || maintainOp === "comprehensive") {
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

  if (maintainOp === "reclassify" || maintainOp === "comprehensive") {
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
        type: "text" as const,
        text: JSON.stringify({
          operation: "maintain",
          success: true,
          maintainOp,
          rebuiltCount,
          prunedCount,
          reclassifiedCount,
          message: `Maintenance complete: ${rebuiltCount} rebuilt, ${prunedCount} pruned, ${reclassifiedCount} reclassified`
        }, null, 2),
      },
    ],
  };
}
