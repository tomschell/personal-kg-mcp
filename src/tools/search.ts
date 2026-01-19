// Search Personal KG MCP Tools
// Contains all search-related tools for finding and retrieving knowledge nodes

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { KnowledgeNodeType } from "../types/enums.js";
import { formatNodes, type FormatOptions, type NodeFormat } from "../utils/format.js";
import { embedText, cosineSimilarity, tokenize } from "../utils/embeddings.js";
import { generateEmbedding, isOpenAIAvailable } from "../utils/openai-embeddings.js";
import { reconstructContext } from "../utils/context.js";
import { expandTags } from "../utils/tagstats.js";
import { expandTagsFull } from "../utils/tagEnhancements.js";
import { expandQuery } from "../utils/queryExpansion.js";

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

// Search mode type
const SearchMode = ["text", "semantic", "time_range"] as const;

export function setupSearchTools(
  server: McpServer,
  storage: FileStorage,
  ann: any, // TODO: Type this properly
  USE_ANN: boolean,
  EMBED_DIM: number,
  tagCo: any // TODO: Type this properly
): void {

  // =============================================================================
  // CONSOLIDATED SEARCH TOOL
  // Replaces: kg_search (text), kg_semantic_search, kg_query_time_range
  // =============================================================================
  server.tool(
    "kg_search",
    "Unified search tool for finding knowledge nodes. Supports three modes: 'text' for keyword/tag filtering with ranking, 'semantic' for AI-powered meaning-based search, 'time_range' for date-based queries. Default mode is 'semantic' for best results.",
    {
      // Core parameters
      query: z.string().optional()
        .describe("Search query text. Required for 'text' and 'semantic' modes. For 'semantic' mode, be descriptive - it finds conceptually similar content."),
      mode: z.enum(SearchMode).default("semantic")
        .describe("Search mode: 'text' for keyword/tag search with ranking, 'semantic' for AI-powered similarity search, 'time_range' for date-based search."),
      limit: z.number().int().min(1).max(100).default(20)
        .describe("Maximum number of results to return."),

      // Text mode parameters
      tags: z.array(z.string()).optional()
        .describe("[text mode] Filter by tags. Tags are expanded with synonyms and hierarchies."),
      type: z.enum(KnowledgeNodeType).optional()
        .describe("[text mode] Filter by node type: idea, decision, progress, insight, question, session."),

      // Semantic mode parameters
      threshold: z.number().min(0).max(1).default(0.15).optional()
        .describe("[semantic mode] Minimum similarity score (0-1). Higher = stricter matching."),
      hybrid: z.boolean().default(false).optional()
        .describe("[semantic mode] Combine semantic similarity with tag matching and term presence."),

      // Time range mode parameters
      start: z.string().optional()
        .describe("[time_range mode] Start date (e.g., '2024-01-01', '2 weeks ago')."),
      end: z.string().optional()
        .describe("[time_range mode] End date (e.g., '2024-12-31', 'today')."),

      // Output formatting (text mode)
      format: z.enum(["full", "summary", "minimal"]).optional()
        .describe("[text mode] Output format for results."),
      includeContent: z.boolean().optional()
        .describe("[text mode] Include full content in results."),
      includeTags: z.boolean().optional()
        .describe("[text mode] Include tags in results."),
      includeMetadata: z.boolean().optional()
        .describe("[text mode] Include metadata in results."),
    },
    async (args) => {
      const { mode, query, limit, tags, type, threshold = 0.15, hybrid = false, start, end, format, includeContent, includeTags, includeMetadata } = args;
      logToolCall("kg_search", { mode, query, limit, tags, type, threshold, hybrid, start, end });

      // Dispatch based on mode
      switch (mode) {
        case "time_range":
          return handleTimeRangeSearch(storage, { start, end, query, limit });

        case "semantic":
          return handleSemanticSearch(storage, ann, USE_ANN, EMBED_DIM, {
            query: query || "",
            limit,
            threshold,
            hybrid
          });

        case "text":
        default:
          return handleTextSearch(storage, EMBED_DIM, {
            query,
            tags,
            type: type as typeof KnowledgeNodeType[number] | undefined,
            limit,
            format: format as NodeFormat | undefined,
            includeContent,
            includeTags,
            includeMetadata
          });
      }
    },
  );

  // =============================================================================
  // CONTEXT QUERY - Stays separate (reconstructs topic context)
  // Consider moving to kg_context in future consolidation
  // =============================================================================
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

  // =============================================================================
  // LIST TAGS - Stays separate (tag discovery/management)
  // =============================================================================
  server.tool(
    "kg_list_tags",
    "Lists all tags in the knowledge graph with usage counts. Use to discover available tags, find inconsistencies, or identify commonly used categories.",
    {
      prefix: z.string().optional()
        .describe("Filter tags by prefix (e.g., 'proj:', 'ws:', 'ticket:')"),
      minCount: z.number().int().min(1).default(1).optional()
        .describe("Minimum usage count to include a tag"),
      limit: z.number().int().min(1).max(500).default(50).optional()
        .describe("Maximum number of tags to return"),
    },
    async ({ prefix, minCount = 1, limit = 50 }) => {
      logToolCall("kg_list_tags", { prefix, minCount, limit });

      const nodes = storage.listAllNodes();
      const tagCounts = new Map<string, number>();

      for (const node of nodes) {
        for (const tag of node.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }

      let tags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }));

      // Filter by prefix
      if (prefix) {
        tags = tags.filter((t) => t.tag.startsWith(prefix));
      }

      // Filter by minimum count
      tags = tags.filter((t) => t.count >= minCount);

      // Sort by count descending, then alphabetically
      tags.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

      // Apply limit
      const total = tags.length;
      tags = tags.slice(0, limit);

      const payload = { total, tags };
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
}

// =============================================================================
// SEARCH MODE HANDLERS
// =============================================================================

interface TextSearchArgs {
  query?: string;
  tags?: string[];
  type?: typeof KnowledgeNodeType[number];
  limit: number;
  format?: NodeFormat;
  includeContent?: boolean;
  includeTags?: boolean;
  includeMetadata?: boolean;
}

async function handleTextSearch(
  storage: FileStorage,
  EMBED_DIM: number,
  args: TextSearchArgs
) {
  const { query, tags, type, limit, format, includeContent, includeTags, includeMetadata } = args;

  // Expand query with synonyms if provided
  const expandedQuery = query ? expandQuery(query) : null;

  // Expand tags with synonyms and hierarchies if provided
  const expandedTags = tags ? expandTagsFull(tags) : [];

  const all = storage.searchNodes({ query, tags, type, limit: 200 });

  // Enhanced ranking: semantic, tag overlap, query term match, importance, recency
  const now = Date.now();
  const qVec = query ? embedText(query, EMBED_DIM) : undefined;
  const baseTags = expandedTags.map((t) => t.toLowerCase());
  const queryTerms = expandedQuery ? new Set(expandedQuery.expanded) : null;

  const scored = all.map((n) => {
    // Semantic similarity (bag-of-words)
    const sem = qVec ? cosineSimilarity(qVec, embedText(n.content, EMBED_DIM)) : 0;

    // Tag overlap with expanded tags
    const nTags = new Set(n.tags.map((t) => t.toLowerCase()));
    let tagOverlap = 0;
    if (baseTags.length > 0) {
      for (const t of baseTags) {
        if (nTags.has(t)) tagOverlap += 1;
      }
      tagOverlap /= baseTags.length;
    }

    // Query term match (expanded query terms in content)
    let termMatch = 0;
    if (queryTerms) {
      const contentTokens = new Set(tokenize(n.content));
      for (const term of queryTerms) {
        if (contentTokens.has(term)) termMatch += 1;
      }
      termMatch /= queryTerms.size;
    }

    // Importance boost (high=1.0, medium=0.5, low=0.0)
    const importanceBoost = n.importance === 'high' ? 1.0 : n.importance === 'medium' ? 0.5 : 0.0;

    // Recency with improved decay (slower decay for better long-term recall)
    const ageDays = Math.max(0, (now - Date.parse(n.updatedAt || n.createdAt)) / (1000 * 60 * 60 * 24));
    const recency = Math.max(0, 1 - ageDays / 60); // 60-day window instead of 30

    // Weighted combination: semantic=40%, tags=25%, term match=15%, importance=10%, recency=10%
    const score = sem * 0.40 + tagOverlap * 0.25 + termMatch * 0.15 + importanceBoost * 0.10 + recency * 0.10;
    return { node: n, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const nodes = scored.slice(0, limit).map((s) => s.node);
  const fmt: FormatOptions = { format, includeContent, includeTags, includeMetadata };
  const payload = { mode: "text", total: nodes.length, nodes: formatNodes(nodes, fmt) } as const;
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

interface SemanticSearchArgs {
  query: string;
  limit: number;
  threshold: number;
  hybrid: boolean;
}

async function handleSemanticSearch(
  storage: FileStorage,
  ann: any,
  USE_ANN: boolean,
  EMBED_DIM: number,
  args: SemanticSearchArgs
) {
  const { query, limit, threshold, hybrid } = args;

  if (!query) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: "Query required for semantic search", results: [] }, null, 2) }],
    };
  }

  // Extract query tokens for hybrid search
  const queryTokens = hybrid ? new Set(tokenize(query)) : null;

  let results: Array<{ id: string; score: number; snippet: string }> = [];
  const nodes = storage.listAllNodes();

  // Check if we can use OpenAI embeddings
  const useOpenAI = isOpenAIAvailable();
  const nodesWithOpenAI = useOpenAI ? nodes.filter(n => n.embedding && n.embedding.length > 0) : [];
  const hasOpenAINodes = nodesWithOpenAI.length > 0;

  // Generate query embedding (OpenAI if available, otherwise local)
  let queryEmbedding: number[] | Float32Array;
  if (useOpenAI && hasOpenAINodes) {
    // Use OpenAI for query embedding to match stored embeddings
    const openaiQueryEmbed = await generateEmbedding(query);
    if (openaiQueryEmbed) {
      queryEmbedding = openaiQueryEmbed;
    } else {
      // Fallback to local if OpenAI fails
      queryEmbedding = embedText(query, EMBED_DIM);
    }
  } else {
    // Use local bag-of-words embedding
    queryEmbedding = embedText(query, EMBED_DIM);
  }

  // Determine if query embedding is OpenAI-based (for compatibility check)
  const queryIsOpenAI = Array.isArray(queryEmbedding) && queryEmbedding.length > 256;

  if (USE_ANN && !hybrid && !queryIsOpenAI) {
    // ANN path - only for pure semantic search with local embeddings
    const top = ann.search(queryEmbedding, limit * 3);
    const nodesById = new Map(nodes.map((n) => [n.id, n] as const));
    results = top
      .map(({ id, score }: { id: string; score: number }) => ({ id, score, node: nodesById.get(id) }))
      .filter((r: { id: string; score: number; node: any }) => r.node && r.score >= threshold)
      .slice(0, limit)
      .map((r: { id: string; score: number; node: any }) => ({ id: r.id, score: r.score, snippet: r.node!.content.slice(0, 160) }));
  } else {
    // Full scan with embedding comparison
    const scored = nodes.map((n) => {
      let semScore: number;

      if (queryIsOpenAI && n.embedding && n.embedding.length > 0) {
        // Both query and node have OpenAI embeddings - use them
        semScore = cosineSimilarity(queryEmbedding, n.embedding);
      } else if (!queryIsOpenAI) {
        // Local query embedding - compare with local embedding of content
        semScore = cosineSimilarity(queryEmbedding, embedText(n.content, EMBED_DIM));
      } else {
        // Query is OpenAI but node doesn't have embedding - lower score
        // This encourages migration while still returning results
        semScore = cosineSimilarity(embedText(query, EMBED_DIM), embedText(n.content, EMBED_DIM)) * 0.8;
      }

      if (!hybrid || !queryTokens) {
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

  const payload = {
    mode: "semantic",
    embeddingType: queryIsOpenAI ? "openai" : "local",
    nodesWithEmbeddings: hasOpenAINodes ? nodesWithOpenAI.length : 0,
    total: results.length,
    results
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

interface TimeRangeSearchArgs {
  start?: string;
  end?: string;
  query?: string;
  limit: number;
}

async function handleTimeRangeSearch(
  storage: FileStorage,
  args: TimeRangeSearchArgs
) {
  const { start, end, query, limit } = args;
  const nodes = storage.listByTimeRange({ start, end, query });
  const limitedNodes = nodes.slice(0, limit);
  // Use formatNodes to strip embeddings and apply consistent formatting
  const formattedNodes = formatNodes(limitedNodes, { format: "summary", summaryLength: 300 });
  const payload = { mode: "time_range", total: limitedNodes.length, nodes: formattedNodes };
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

// =============================================================================
// CONTEXT INJECTION TOOLS
// =============================================================================

export function setupContextTools(
  server: McpServer,
  storage: FileStorage,
  EMBED_DIM: number
): void {
  server.tool(
    "kg_get_relevant_context",
    "Retrieves relevant past context for a given query. Returns brief summaries of related decisions, insights, and open questions. Perfect for proactive context injection before starting work on a topic.",
    {
      query: z.string()
        .describe("The topic or task to find relevant context for"),
      project: z.string().optional()
        .describe("Optional project name to scope the search (normalized to 'proj:project-name')"),
      max_items: z.number().int().min(1).max(10).default(5)
        .describe("Maximum number of context items to return"),
      include_questions: z.boolean().default(true)
        .describe("Whether to include open questions in the context"),
    },
    async ({ query, project, max_items, include_questions }) => {
      logToolCall("kg_get_relevant_context", { query, project, max_items, include_questions });

      const projectTag = project
        ? `proj:${project.toLowerCase().replace(/\s+/g, "-")}`
        : undefined;

      // Get all relevant nodes
      const allNodes = storage.listAllNodes();

      // Filter by project if specified
      const filtered = projectTag
        ? allNodes.filter((n) => n.tags.includes(projectTag))
        : allNodes;

      // Determine if we can use OpenAI embeddings
      const useOpenAI = isOpenAIAvailable();
      const nodesWithOpenAI = useOpenAI ? filtered.filter(n => n.embedding && n.embedding.length > 0) : [];
      const hasOpenAINodes = nodesWithOpenAI.length > 0;

      // Generate query embedding
      let queryEmbed: number[] | Float32Array;
      if (useOpenAI && hasOpenAINodes) {
        const openaiEmbed = await generateEmbedding(query);
        queryEmbed = openaiEmbed || embedText(query, EMBED_DIM);
      } else {
        queryEmbed = embedText(query, EMBED_DIM);
      }

      const queryIsOpenAI = Array.isArray(queryEmbed) && queryEmbed.length > 256;

      // Score nodes by relevance
      const scored = filtered.map((n) => {
        let similarity: number;

        if (queryIsOpenAI && n.embedding && n.embedding.length > 0) {
          similarity = cosineSimilarity(queryEmbed, n.embedding);
        } else if (!queryIsOpenAI) {
          similarity = cosineSimilarity(queryEmbed, embedText(n.content, EMBED_DIM));
        } else {
          similarity = cosineSimilarity(embedText(query, EMBED_DIM), embedText(n.content, EMBED_DIM)) * 0.8;
        }

        // Boost decisions and insights
        const typeBoost = n.type === "decision" ? 1.3 :
                          n.type === "insight" ? 1.2 :
                          n.type === "question" ? 1.1 : 1.0;

        // Boost high importance
        const importanceBoost = n.importance === "high" ? 1.2 :
                                n.importance === "medium" ? 1.0 : 0.8;

        // Recency factor (1.0 for today, 0.5 for 30 days ago)
        const ageDays = (Date.now() - new Date(n.updatedAt || n.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const recencyFactor = Math.max(0.3, 1 - ageDays / 60);

        return {
          node: n,
          score: similarity * typeBoost * importanceBoost * recencyFactor,
          similarity,
        };
      });

      // Sort by score
      scored.sort((a, b) => b.score - a.score);

      // Get decisions/insights
      const relevantDecisions = scored
        .filter((s) => s.node.type === "decision" && s.similarity > 0.2)
        .slice(0, Math.ceil(max_items * 0.6));

      const relevantInsights = scored
        .filter((s) => s.node.type === "insight" && s.similarity > 0.2)
        .slice(0, Math.ceil(max_items * 0.3));

      // Get open questions if requested
      let openQuestions: typeof scored = [];
      if (include_questions) {
        const questionNodes = scored.filter((s) =>
          s.node.type === "question" && s.similarity > 0.15
        );

        // Filter to only unresolved questions
        openQuestions = questionNodes.filter((s) => {
          const edges = storage.listEdges(s.node.id);
          return !edges.some((e) => e.relation === "resolved_by");
        }).slice(0, 2);
      }

      // Build context items
      const contextItems: Array<{
        type: string;
        summary: string;
        id: string;
        relevance: number;
      }> = [];

      for (const item of relevantDecisions) {
        contextItems.push({
          type: "decision",
          summary: item.node.content.length > 200
            ? item.node.content.slice(0, 200) + "..."
            : item.node.content,
          id: item.node.id,
          relevance: Math.round(item.similarity * 100),
        });
      }

      for (const item of relevantInsights) {
        contextItems.push({
          type: "insight",
          summary: item.node.content.length > 200
            ? item.node.content.slice(0, 200) + "..."
            : item.node.content,
          id: item.node.id,
          relevance: Math.round(item.similarity * 100),
        });
      }

      for (const item of openQuestions) {
        contextItems.push({
          type: "open_question",
          summary: item.node.content.length > 200
            ? item.node.content.slice(0, 200) + "..."
            : item.node.content,
          id: item.node.id,
          relevance: Math.round(item.similarity * 100),
        });
      }

      // Sort by relevance and limit
      contextItems.sort((a, b) => b.relevance - a.relevance);
      const finalItems = contextItems.slice(0, max_items);

      // Generate brief context message
      let briefContext = "";
      if (finalItems.length > 0) {
        const decisionCount = finalItems.filter((i) => i.type === "decision").length;
        const insightCount = finalItems.filter((i) => i.type === "insight").length;
        const questionCount = finalItems.filter((i) => i.type === "open_question").length;

        const parts: string[] = [];
        if (decisionCount > 0) {
          const topDecision = finalItems.find((i) => i.type === "decision");
          parts.push(`Previously decided: ${topDecision?.summary.slice(0, 100)}...`);
        }
        if (questionCount > 0) {
          const topQuestion = finalItems.find((i) => i.type === "open_question");
          parts.push(`Open question: ${topQuestion?.summary.slice(0, 80)}...`);
        }
        if (insightCount > 0 && parts.length < 2) {
          const topInsight = finalItems.find((i) => i.type === "insight");
          parts.push(`Prior insight: ${topInsight?.summary.slice(0, 80)}...`);
        }

        briefContext = parts.join(" ");
      }

      const response = {
        found: finalItems.length,
        briefContext: briefContext || "No relevant prior context found.",
        items: finalItems,
        query,
        project: projectTag,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );
}
