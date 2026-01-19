// Analysis Personal KG MCP Tools
// Contains consolidated analysis and graph exploration tools
import { z } from "zod";
import { embedText, cosineSimilarity } from "../utils/embeddings.js";
import { isOpenAIAvailable } from "../utils/openai-embeddings.js";
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
// Analysis operation types
const AnalyzeOperation = ["clusters", "emerging", "graph_export", "path"];
export function setupAnalysisTools(server, storage) {
    // =============================================================================
    // CONSOLIDATED ANALYZE TOOL
    // Replaces: kg_detect_topic_clusters, kg_find_emerging_concepts,
    //           kg_graph_export, kg_find_connection_path
    // =============================================================================
    server.tool("kg_analyze", "Unified analysis tool. Supports: 'clusters' for topic grouping, 'emerging' for trend detection, 'graph_export' for full export, 'path' for finding connections between nodes.", {
        operation: z.enum(AnalyzeOperation)
            .describe("Analysis operation: 'clusters', 'emerging', 'graph_export', 'path'."),
        // clusters options
        threshold: z.number().min(0).max(1).default(0.55).optional()
            .describe("[clusters] Similarity threshold (higher = stricter grouping)."),
        // emerging options
        windowDays: z.number().int().min(1).max(90).default(7).optional()
            .describe("[emerging] Days to look back for recent activity."),
        // path options
        startId: z.string().optional()
            .describe("[path] Starting node ID."),
        endId: z.string().optional()
            .describe("[path] Target node ID."),
        maxDepth: z.number().int().min(1).max(6).default(4).optional()
            .describe("[path] Maximum hops to search."),
        // shared options
        limit: z.number().int().min(1).max(10000).default(500).optional()
            .describe("[clusters, emerging] Maximum nodes to analyze."),
    }, async (args) => {
        const { operation, threshold = 0.55, windowDays = 7, startId, endId, maxDepth = 4, limit = 500 } = args;
        logToolCall("kg_analyze", { operation, threshold, windowDays, startId, endId, maxDepth, limit });
        switch (operation) {
            case "clusters":
                return handleClusters(storage, limit, threshold);
            case "emerging":
                return handleEmerging(storage, limit, windowDays);
            case "graph_export":
                return handleGraphExport(storage);
            case "path":
                return handlePath(storage, startId, endId, maxDepth);
            default:
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ error: `Unknown operation: ${operation}` }, null, 2),
                        },
                    ],
                };
        }
    });
}
// =============================================================================
// ANALYSIS OPERATION HANDLERS
// =============================================================================
/**
 * Helper to compute similarity between two nodes.
 * Uses OpenAI embeddings if available, otherwise falls back to local.
 */
function computeNodeSimilarity(a, b) {
    // Check if both nodes have OpenAI embeddings
    if (a.embedding && a.embedding.length > 0 && b.embedding && b.embedding.length > 0) {
        return cosineSimilarity(a.embedding, b.embedding);
    }
    // Fallback to local bag-of-words
    return cosineSimilarity(embedText(a.content), embedText(b.content));
}
async function handleClusters(storage, limit, threshold) {
    const nodes = storage.listAllNodes().slice(0, limit);
    const clusters = [];
    // Track embedding type used
    const useOpenAI = isOpenAIAvailable();
    const nodesWithEmbeddings = nodes.filter(n => n.embedding && n.embedding.length > 0);
    const embeddingType = useOpenAI && nodesWithEmbeddings.length > 0 ? "openai" : "local";
    // Simple clustering based on content similarity
    const processed = new Set();
    for (const node of nodes) {
        if (processed.has(node.id))
            continue;
        const cluster = [node.id];
        processed.add(node.id);
        for (const otherNode of nodes) {
            if (processed.has(otherNode.id))
                continue;
            const similarity = computeNodeSimilarity(node, otherNode);
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
                text: JSON.stringify({
                    operation: "clusters",
                    embeddingType,
                    nodesWithEmbeddings: nodesWithEmbeddings.length,
                    total: clusters.length,
                    clusters
                }, null, 2),
            },
        ],
    };
}
async function handleEmerging(storage, limit, windowDays) {
    const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
    const recentNodes = storage.listAllNodes()
        .filter(n => new Date(n.createdAt).getTime() > cutoff)
        .slice(0, limit);
    // Simple emerging concept detection based on tag frequency
    const tagCounts = {};
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
                text: JSON.stringify({ operation: "emerging", total: emerging.length, emerging }, null, 2),
            },
        ],
    };
}
async function handleGraphExport(storage) {
    const nodes = storage.listAllNodes();
    const edges = storage.listEdges();
    // Create graph structure with metadata
    const graphStructure = {
        operation: "graph_export",
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
            }, {}),
            relationTypes: edges.reduce((acc, edge) => {
                acc[edge.relation] = (acc[edge.relation] || 0) + 1;
                return acc;
            }, {}),
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
}
async function handlePath(storage, startId, endId, maxDepth = 4) {
    if (!startId || !endId) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ error: "startId and endId are required for path operation" }, null, 2),
                },
            ],
        };
    }
    const edges = storage.listEdges();
    // Simple path finding using BFS
    const graph = {};
    for (const edge of edges) {
        if (!graph[edge.fromNodeId])
            graph[edge.fromNodeId] = [];
        if (!graph[edge.toNodeId])
            graph[edge.toNodeId] = [];
        graph[edge.fromNodeId].push(edge.toNodeId);
        graph[edge.toNodeId].push(edge.fromNodeId);
    }
    const queue = [{ node: startId, path: [startId] }];
    const visited = new Set();
    while (queue.length > 0) {
        const { node, path } = queue.shift();
        if (node === endId) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ operation: "path", found: true, path, length: path.length }, null, 2),
                    },
                ],
            };
        }
        if (visited.has(node) || path.length > maxDepth)
            continue;
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
                text: JSON.stringify({ operation: "path", found: false, path: [], length: 0, message: "No path found" }, null, 2),
            },
        ],
    };
}
