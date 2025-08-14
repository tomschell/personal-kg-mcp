// Search Personal KG MCP Tools
// Contains all search-related tools for finding and retrieving knowledge nodes
import { z } from "zod";
import { KnowledgeNodeType } from "../types/enums.js";
import { formatNodes } from "../utils/format.js";
import { embedText, cosineSimilarity } from "../utils/embeddings.js";
import { reconstructContext } from "../utils/context.js";
import { expandTags } from "../utils/tagstats.js";
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
export function setupSearchTools(server, storage, ann, // TODO: Type this properly
USE_ANN, EMBED_DIM, tagCo // TODO: Type this properly
) {
    // List recent nodes
    server.tool("kg_list_recent", {
        limit: z.number().int().min(1).max(100).default(20),
        format: z.enum(["full", "summary", "minimal"]).optional(),
        includeContent: z.boolean().optional(),
        includeTags: z.boolean().optional(),
        includeMetadata: z.boolean().optional(),
        summaryLength: z.number().int().min(1).max(2000).optional(),
    }, async ({ limit, format, includeContent, includeTags, includeMetadata, summaryLength }) => {
        logToolCall("kg_list_recent", { limit, format, includeContent, includeTags, includeMetadata, summaryLength });
        const nodes = storage.listRecent(limit);
        const fmt = { format, includeContent, includeTags, includeMetadata, summaryLength };
        const payload = { total: nodes.length, nodes: formatNodes(nodes, fmt) };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(payload, null, 2),
                },
            ],
            structuredContent: payload,
        };
    });
    // Search nodes
    server.tool("kg_search", {
        query: z.string().optional(),
        tags: z.array(z.string()).optional(),
        type: z.enum(KnowledgeNodeType).optional(),
        limit: z.number().int().min(1).max(100).default(20),
        format: z.enum(["full", "summary", "minimal"]).optional(),
        includeContent: z.boolean().optional(),
        includeTags: z.boolean().optional(),
        includeMetadata: z.boolean().optional(),
        summaryLength: z.number().int().min(1).max(2000).optional(),
    }, async ({ query, tags, type, limit, format, includeContent, includeTags, includeMetadata, summaryLength }) => {
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
            if (baseTags.length > 0)
                for (const t of baseTags)
                    if (nTags.has(t))
                        tagOverlap += 1;
            if (baseTags.length > 0)
                tagOverlap /= baseTags.length;
            const ageDays = Math.max(0, (now - Date.parse(n.updatedAt || n.createdAt)) / (1000 * 60 * 60 * 24));
            const recency = Math.max(0, 1 - ageDays / 30);
            const score = sem * 0.6 + tagOverlap * 0.25 + recency * 0.15;
            return { node: n, score };
        });
        scored.sort((a, b) => b.score - a.score);
        const nodes = scored.slice(0, limit).map((s) => s.node);
        const fmt = { format, includeContent, includeTags, includeMetadata, summaryLength };
        const payload = { total: nodes.length, nodes: formatNodes(nodes, fmt) };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(payload, null, 2),
                },
            ],
            structuredContent: payload,
        };
    });
    // Semantic search
    server.tool("kg_semantic_search", "Performs AI-powered semantic search using vector similarity. Finds knowledge nodes based on meaning and context rather than exact keywords. Returns most conceptually similar results ranked by relevance.", { query: z.string()
            .describe("Natural language search query. Be descriptive - this uses AI to find semantically similar content, not just keyword matches."),
        limit: z.number().int().min(1).max(50).default(10)
            .describe("Maximum number of results to return. More results = broader coverage but less relevance.") }, async ({ query, limit }) => {
        logToolCall("kg_semantic_search", { query, limit });
        const q = embedText(query, EMBED_DIM);
        let results = [];
        if (USE_ANN) {
            const top = ann.search(q, limit * 3);
            const nodesById = new Map(storage.listAllNodes().map((n) => [n.id, n]));
            results = top
                .map(({ id, score }) => ({ id, score, node: nodesById.get(id) }))
                .filter((r) => r.node)
                .slice(0, limit)
                .map((r) => ({ id: r.id, score: r.score, snippet: r.node.content.slice(0, 160) }));
        }
        else {
            const nodes = storage.listAllNodes();
            const scored = nodes.map((n) => ({
                node: n,
                score: cosineSimilarity(q, embedText(n.content, EMBED_DIM)),
            }));
            scored.sort((a, b) => b.score - a.score);
            results = scored.slice(0, limit).map((r) => ({
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
    });
    // Find similar nodes
    server.tool("kg_find_similar", { nodeId: z.string(), limit: z.number().int().min(1).max(50).default(10) }, async ({ nodeId, limit }) => {
        logToolCall("kg_find_similar", { nodeId, limit });
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
        const results = scored.slice(0, limit).map((r) => ({
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
    });
    // Time range query
    server.tool("kg_query_time_range", "Searches for knowledge nodes within a specific time period. Use to find work done during particular dates or to analyze activity patterns over time.", {
        start: z.string().optional()
            .describe("Start date/time for the search range (e.g., '2024-01-01', '2 weeks ago')"),
        end: z.string().optional()
            .describe("End date/time for the search range (e.g., '2024-12-31', 'today')"),
        query: z.string().optional()
            .describe("Optional text query to filter nodes within the time range"),
    }, async ({ start, end, query }) => {
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
    });
    // Context query
    server.tool("kg_query_context", "Reconstructs context around a specific topic by analyzing related knowledge nodes. Use to understand the full context and background of a particular subject area.", {
        topic: z.string()
            .describe("Topic or subject area to reconstruct context for (e.g., 'deployment', 'api-design', 'bug-fix')")
    }, async ({ topic }) => {
        logToolCall("kg_query_context", { topic });
        const nodes = storage.listAllNodes();
        const summary = reconstructContext(nodes, topic);
        return {
            content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
            structuredContent: summary,
        };
    });
    // Expanded query: simple synonym expansion and unioned summary
    server.tool("kg_query_context_expanded", { topic: z.string() }, async ({ topic }) => {
        warnDeprecated("kg_query_context_expanded", "Use kg_query_context; the expanded variant does not add value currently and will be removed in a future release.");
        logToolCall("kg_query_context_expanded", { topic });
        const nodes = storage.listAllNodes();
        const base = reconstructContext(nodes, topic);
        // Expand via tag co-occurrence for tag-like topics (non-breaking: we return base for now)
        const tl = topic.toLowerCase().trim();
        if (/^(proj:|ws:|ticket:)/.test(tl) || tl.split(/\s+/).length === 1) {
            const _expanded = expandTags([tl], tagCo, 5);
            void _expanded; // reserved for future merge strategy
        }
        return {
            content: [{ type: "text", text: JSON.stringify(base, null, 2) }],
            structuredContent: base,
        };
    });
    // Deprecated alias
    server.tool("query_context", { query: z.string() }, async ({ query }) => {
        warnDeprecated("query_context", "Use kg_query_context instead; this alias will be removed in a future release.");
        logToolCall("query_context", { query });
        const nodes = storage.listAllNodes();
        const summary = reconstructContext(nodes, query);
        return {
            content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
            structuredContent: summary,
        };
    });
}
