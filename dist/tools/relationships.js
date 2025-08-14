// Relationship Personal KG MCP Tools
// Contains relationship management tools
import { z } from "zod";
import { scoreRelationship, classifyRelationship, computeStrengthFactors } from "../utils/relationships.js";
// Helper functions
function logToolCall(name, args) {
    try {
        const now = new Date().toISOString();
        if (args && typeof args === "object") {
            const keys = Object.keys(args);
            const preview = {};
            for (const k of keys) {
                const v = args[k];
                if (typeof v === "string" && v.length <= 120) {
                    preview[k] = v;
                }
                else if (typeof v === "number" || typeof v === "boolean" || v == null) {
                    preview[k] = v;
                }
                else if (Array.isArray(v)) {
                    preview[k] = `array(len=${v.length})`;
                }
                else if (typeof v === "object") {
                    preview[k] = "object";
                }
            }
            // IMPORTANT: write logs to stderr to avoid corrupting MCP stdio JSON
            console.error(`[PKG] ${now} tool=${name} args=${JSON.stringify(preview)}`);
        }
        else {
            // IMPORTANT: write logs to stderr to avoid corrupting MCP stdio JSON
            console.error(`[PKG] ${now} tool=${name}`);
        }
    }
    catch {
        // ignore logging failures
    }
}
// Temporary helper for non-breaking deprecation notices
function warnDeprecated(toolName, message) {
    try {
        // IMPORTANT: write warnings to stderr to avoid corrupting MCP stdio JSON
        console.error(`[PKG][DEPRECATED] ${toolName}: ${message}`);
    }
    catch {
        // ignore logging failures
    }
}
export function setupRelationshipTools(server, storage) {
    // Create explicit relationships between nodes
    server.tool("kg_create_edge", "Creates explicit relationships between knowledge nodes. Use this to link related ideas, mark dependencies, or establish conceptual connections. Relationships are automatically scored for strength based on content similarity.", {
        fromNodeId: z.string()
            .describe("ID of the source node (the node that references/blocks/derives from another)"),
        toNodeId: z.string()
            .describe("ID of the target node (the node being referenced/blocked/derived from)"),
        relation: z.enum([
            "references",
            "relates_to",
            "derived_from",
            "blocks",
            "duplicates",
        ])
            .describe("Type of relationship: 'references' for citations, 'relates_to' for general connections, 'derived_from' for ideas building on others, 'blocks' for dependencies, 'duplicates' for redundant content."),
    }, async ({ fromNodeId, toNodeId, relation }) => {
        logToolCall("kg_create_edge", { fromNodeId, toNodeId, relation });
        const a = storage.getNode(fromNodeId);
        const b = storage.getNode(toNodeId);
        const strength = a && b ? scoreRelationship(a, b) : undefined;
        const edge = storage.createEdge(fromNodeId, toNodeId, relation, {
            strength,
        });
        return {
            content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }],
        };
    });
    // Mark derived-from relationships
    server.tool("kg_mark_derived_from", { childId: z.string(), parentId: z.string() }, async ({ childId, parentId }) => {
        // kept for ergonomics; consider deprecation in a later pass
        logToolCall("kg_mark_derived_from", { childId, parentId });
        const a = storage.getNode(childId);
        const b = storage.getNode(parentId);
        const s = a && b ? scoreRelationship(a, b) : undefined;
        const edge = storage.createEdge(childId, parentId, "derived_from", { strength: s });
        return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    });
    // List relationships for a node
    server.tool("kg_list_edges", "Lists all relationships (edges) in the knowledge graph, optionally filtered by a specific node. Use to explore connections between knowledge nodes and understand the graph structure.", {
        nodeId: z.string().optional()
            .describe("Optional node ID to filter edges - if provided, shows only edges connected to this node")
    }, async ({ nodeId }) => {
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
    });
    // Rebuild relationship scores (deprecated)
    server.tool("kg_rebuild_relationships", {
        threshold: z.number().min(0).max(1).default(0.35),
        limit: z.number().int().min(1).max(10000).default(1000),
    }, async ({ threshold, limit }) => {
        warnDeprecated("kg_rebuild_relationships", "Use kg_relationships_maintenance with rebuildThreshold instead; this tool will be removed in a future release.");
        logToolCall("kg_rebuild_relationships", { threshold, limit });
        const nodes = storage.listAllNodes().slice(0, limit);
        let created = 0;
        let considered = 0;
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const s = scoreRelationship(nodes[i], nodes[j]);
                considered++;
                if (s >= threshold) {
                    const relation = classifyRelationship(nodes[i], nodes[j]);
                    const evidence = [JSON.stringify(computeStrengthFactors(nodes[i], nodes[j]))];
                    storage.createEdge(nodes[i].id, nodes[j].id, relation, { strength: s, evidence });
                    created++;
                }
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ created, considered }, null, 2),
                },
            ],
        };
    });
    // Relationship maintenance: rebuild then prune
    server.tool("kg_relationships_maintenance", {
        rebuildThreshold: z.number().min(0).max(1).default(0.35),
        pruneThreshold: z.number().min(0).max(1).default(0.15),
        limit: z.number().int().min(1).max(10000).default(1000),
    }, async ({ rebuildThreshold, pruneThreshold, limit }) => {
        logToolCall("kg_relationships_maintenance", { rebuildThreshold, pruneThreshold, limit });
        const nodes = storage.listAllNodes().slice(0, limit);
        let created = 0;
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const s = scoreRelationship(nodes[i], nodes[j]);
                if (s >= rebuildThreshold) {
                    const relation = classifyRelationship(nodes[i], nodes[j]);
                    const evidence = [JSON.stringify(computeStrengthFactors(nodes[i], nodes[j]))];
                    storage.createEdge(nodes[i].id, nodes[j].id, relation, { strength: s, evidence });
                    created++;
                }
            }
        }
        // prune
        const fs = await import("node:fs");
        const path = await import("node:path");
        const edgesDir = storage.getEdgesDir();
        let removed = 0;
        for (const f of fs.readdirSync(edgesDir)) {
            if (!f.endsWith(".json"))
                continue;
            const p = path.join(edgesDir, f);
            const e = JSON.parse(fs.readFileSync(p, "utf8"));
            if (typeof e.strength === "number" && e.strength < pruneThreshold) {
                fs.rmSync(p);
                removed++;
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ created, removed }, null, 2),
                },
            ],
        };
    });
}
