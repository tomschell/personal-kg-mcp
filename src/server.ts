import { config } from "dotenv";
config({ path: ".env" });
config({ path: "../../.env" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// Provide a CommonJS require in ESM context for hosts that expect it
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).require = require;
import { ImportanceLevel, KnowledgeNodeType } from "./types/enums.js";
import { getHealth } from "./handlers/health.js";
import { FileStorage } from "./storage/FileStorage.js";
import type { CreateNodeInput } from "./types/domain.js";
import { findAutoLinks } from "./utils/autoLink.js";
import { cosineSimilarity, embedText } from "./utils/embeddings.js";
import { AnnIndex } from "./utils/ann.js";
import { reconstructContext } from "./utils/context.js";
import { scoreRelationship, classifyRelationship, computeStrengthFactors } from "./utils/relationships.js";
import { buildGraphExport } from "./utils/graph.js";
import { formatNodes, type FormatOptions } from "./utils/format.js";
import { buildTagCooccurrence, expandTags } from "./utils/tagstats.js";
import { clusterBySimilarity } from "./utils/clustering.js";
import { findEmergingConcepts } from "./utils/emerging.js";
import { WorkstreamDashboardService } from "./services/workstreamDashboard.js";

export const PERSONAL_KG_TOOLS = ["kg_health", "kg_capture"] as const;

export function createPersonalKgServer(): McpServer {
  const server = new McpServer({ name: "personal-kg-mcp", version: "0.1.0" });
  const storage = new FileStorage({
    baseDir: process.env.PKG_STORAGE_DIR ?? ".kg",
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
    if (project && project.trim()) set.add(`proj:${normalizeTagString(project)}`);
    if (workstream && workstream.trim()) set.add(`ws:${normalizeTagString(workstream)}`);
    if (ticket && ticket.trim()) set.add(`ticket:${normalizeTagString(ticket)}`);
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

  // Temporary helper for non-breaking deprecation notices
  function warnDeprecated(toolName: string, message: string): void {
    try {
      // IMPORTANT: write warnings to stderr to avoid corrupting MCP stdio JSON
      console.error(`[PKG][DEPRECATED] ${toolName}: ${message}`);
    } catch {
      // ignore logging failures
    }
  }

  // Basic health tool
  server.tool(
    PERSONAL_KG_TOOLS[0],
    "Provides system health status and diagnostic information about the Personal KG. Use to check if the knowledge graph is functioning properly, verify storage integrity, and get basic system metrics.",
    {},
    async () => {
      logToolCall("kg_health");
      const { result } = getHealth();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  // Minimal placeholder: capture node (spec-driven to be expanded)

  server.tool(
    PERSONAL_KG_TOOLS[1],
    "Primary tool for capturing knowledge nodes. Use this to record decisions, progress updates, insights, questions, and ideas. Automatically creates relationships, normalizes tags, and links to sessions. This is your main entry point for adding knowledge to the graph.",
    {
      content: z.string()
        .describe("The main content of the knowledge node. Be specific and include context. This is the primary information being captured."),
      type: z.enum(KnowledgeNodeType).default("idea")
        .describe("Type of knowledge node: 'idea' for thoughts/concepts, 'decision' for choices made, 'progress' for work updates, 'insight' for learnings/discoveries, 'question' for open questions, 'session' for session summaries."),
      tags: z.array(z.string()).optional()
        .describe("Free-form tags for categorization. Will be normalized (lowercase, dash-separated). Examples: 'frontend', 'api-design', 'bug-fix'."),
      visibility: z.enum(["private", "team", "public"]).optional()
        .describe("Visibility level: 'private' (only you), 'team' (shared with team), 'public' (fully public). Defaults to private."),
      includeGit: z.boolean().default(false)
        .describe("Whether to capture current Git context (branch, commit hash). Useful for linking knowledge to specific code states."),
      importance: z.enum(ImportanceLevel).default("medium")
        .describe("Importance level: 'high' for critical decisions/blockers, 'medium' for regular work, 'low' for minor notes."),
      auto_link: z.boolean().default(true)
        .describe("Whether to automatically create relationships to related nodes based on content similarity and tags."),
      // session grouping and tag normalization
      sessionId: z.string().optional()
        .describe("ID of a session node to link this capture to. Used for grouping related work within a session."),
      link_to_session: z.boolean().default(true)
        .describe("Whether to create a relationship to the specified session. Only applies if sessionId is provided."),
      project: z.string().optional()
        .describe("Project name for automatic tagging. Will be normalized and prefixed as 'proj:project-name'."),
      workstream: z.string().optional()
        .describe("Workstream name for automatic tagging. Will be normalized and prefixed as 'ws:workstream-name'."),
      ticket: z.string().optional()
        .describe("Ticket/issue ID for automatic tagging. Will be normalized and prefixed as 'ticket:123'."),
    },
    async (args) => {
      logToolCall("kg_capture", args);
      let git: CreateNodeInput["git"] | undefined;
      if (args.includeGit) {
        try {
          const { execSync } = await import("node:child_process");
          const branch = execSync("git rev-parse --abbrev-ref HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
          })
            .toString()
            .trim();
          const commit = execSync("git rev-parse HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
          })
            .toString()
            .trim();
          const repoPath = process.cwd();
          git = {
            repositoryPath: repoPath,
            currentBranch: branch,
            currentCommit: commit,
          };
        } catch {
          // ignore git errors; leave git undefined
        }
      }
      const normalizedTags = normalizeTags(
        args.tags,
        args.project,
        args.workstream,
        args.ticket,
      );
      const input: CreateNodeInput = {
        content: args.content,
        type: args.type,
        tags: normalizedTags,
        visibility: args.visibility,
        git,
        importance: args.importance,
      };
      const node = storage.createNode(input);
      // Incremental ANN insert
      if (USE_ANN) {
        try {
          ann.add(node.id, embedText(node.content, EMBED_DIM));
        } catch {}
      }
      // Optional link to session
      if (args.sessionId && args.link_to_session) {
        try {
          const session = storage.getNode(args.sessionId);
          if (session && session.type === "session") {
            const a = session;
            const b = node;
            const s = scoreRelationship(a, b);
            storage.createEdge(args.sessionId, node.id, "references", { strength: s });
          }
        } catch {}
      }
      // Auto-link progress entries within same workstream
      if (node.type === "progress") {
        const wsTag = getWorkstreamTag(node.tags);
        if (wsTag) {
          const recentSameWs = storage
            .searchNodes({ tags: [wsTag], type: "progress", limit: 20 })
            .filter((n) => n.id !== node.id);
          for (const other of recentSameWs.slice(0, 5)) {
            const s = scoreRelationship(node, other);
            storage.createEdge(node.id, other.id, "relates_to", { strength: s });
          }
        }
      }
      // optional auto-link
      if (args.auto_link) {
        const candidates = storage.searchNodes({ limit: 50 });
        const links = findAutoLinks(candidates, node.content);
        for (const id of links) {
          const other = storage.getNode(id);
          const strength = other ? scoreRelationship(node, other) : undefined;
          storage.createEdge(node.id, id, "relates_to", {
            strength,
            evidence: ["tags/content overlap"],
          });
        }
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ accepted: true, node }, null, 2),
          },
        ],
      };
    },
  );

  // Alias for Issue #62 acceptance: capture_context
  server.tool(
    "capture_context",
    {
      content: z.string(),
      type: z.enum(KnowledgeNodeType).default("idea"),
      tags: z.array(z.string()).optional(),
      visibility: z.enum(["private", "team", "public"]).optional(),
      includeGit: z.boolean().default(false),
      importance: z.enum(ImportanceLevel).default("medium"),
      auto_link: z.boolean().default(true),
      sessionId: z.string().optional(),
      link_to_session: z.boolean().default(true),
      project: z.string().optional(),
      workstream: z.string().optional(),
      ticket: z.string().optional(),
    },
    async (args) => {
      warnDeprecated(
        "capture_context",
        "Use kg_capture instead; this alias will be removed in a future release.",
      );
      logToolCall("capture_context", args);
      let git: CreateNodeInput["git"] | undefined;
      if (args.includeGit) {
        try {
          const { execSync } = await import("node:child_process");
          const branch = execSync("git rev-parse --abbrev-ref HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
          })
            .toString()
            .trim();
          const commit = execSync("git rev-parse HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
          })
            .toString()
            .trim();
          const repoPath = process.cwd();
          git = {
            repositoryPath: repoPath,
            currentBranch: branch,
            currentCommit: commit,
          };
        } catch {
          // ignore git errors; leave git undefined
        }
      }
      const normalizedTags = normalizeTags(
        args.tags,
        args.project,
        args.workstream,
        args.ticket,
      );
      const input: CreateNodeInput = {
        content: args.content,
        type: args.type,
        tags: normalizedTags,
        visibility: args.visibility,
        git,
        importance: args.importance,
      };
      const node = storage.createNode(input);
      if (USE_ANN) {
        try {
          ann.add(node.id, embedText(node.content, EMBED_DIM));
        } catch {}
      }
      if (args.sessionId && args.link_to_session) {
        try {
          const session = storage.getNode(args.sessionId);
          if (session && session.type === "session") {
            const a = session;
            const b = node;
            const s = scoreRelationship(a, b);
            const relation = classifyRelationship(a, b);
            storage.createEdge(args.sessionId, node.id, relation, { strength: s });
          }
        } catch {}
      }
      if (args.auto_link) {
        const candidates = storage.searchNodes({ limit: 50 });
        const links = findAutoLinks(candidates, node.content);
        for (const id of links) {
          const other = storage.getNode(id);
          const strength = other ? scoreRelationship(node, other) : undefined;
          const relation = other ? classifyRelationship(node, other) : "relates_to";
          const evidence = other
            ? ["tags/content overlap", JSON.stringify(computeStrengthFactors(node, other))]
            : ["tags/content overlap"];
          storage.createEdge(node.id, id, relation, { strength, evidence });
        }
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ accepted: true, node }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "kg_capture_session",
    "Captures session summaries with structured metadata. Use at the end of work sessions to record what was accomplished, artifacts created, and next actions. Essential for maintaining context between sessions and tracking progress over time.",
    {
      summary: z.string()
        .describe("Concise summary of what was accomplished in this session. Focus on outcomes and key decisions."),
      duration: z.string().optional()
        .describe("How long the session lasted (e.g., '2 hours', '45 minutes'). Helps track time investment."),
      artifacts: z.array(z.string()).optional()
        .describe("List of deliverables created (e.g., ['Updated API docs', 'Fixed auth bug', 'Deployed v1.2'])"),
      next_actions: z.array(z.string()).optional()
        .describe("Specific tasks for next session. These become your starting context when you resume work."),
      visibility: z.enum(["private", "team", "public"]).optional()
        .describe("Visibility level for the session summary. Defaults to private."),
      importance: z.enum(ImportanceLevel).default("medium")
        .describe("Session importance: 'high' for major milestones, 'medium' for regular work, 'low' for minor sessions."),
    },
    async ({
      summary,
      duration,
      artifacts,
      next_actions,
      visibility,
      importance,
    }) => {
      logToolCall("kg_capture_session", { summary, duration, artifacts, next_actions, visibility, importance });
      const content = [
        `Session Summary: ${summary}`,
        duration ? `Duration: ${duration}` : undefined,
        artifacts?.length ? `Artifacts: ${artifacts.join(", ")}` : undefined,
        next_actions?.length
          ? `Next Actions: ${next_actions.join("; ")}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n");
      const node = storage.createNode({
        content,
        type: "session",
        tags: ["session"],
        visibility,
        importance,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ accepted: true, node }, null, 2),
          },
        ],
      };
    },
  );

  // Convenience: link a node to a session (session -> node, references)
  server.tool(
    "kg_link_session",
    "Creates a relationship between a session node and another knowledge node. Use to explicitly link work items, decisions, or progress to a specific session for better organization.",
    { 
      sessionId: z.string()
        .describe("ID of the session node to link from"),
      nodeId: z.string()
        .describe("ID of the knowledge node to link to the session")
    },
    async ({ sessionId, nodeId }) => {
      logToolCall("kg_link_session", { sessionId, nodeId });
      const a = storage.getNode(sessionId);
      const b = storage.getNode(nodeId);
      const s = a && b ? scoreRelationship(a, b) : undefined;
      const edge = storage.createEdge(sessionId, nodeId, "references", { strength: s });
      return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    },
  );

  // Alias for Issue #62 acceptance: capture_session
  server.tool(
    "capture_session",
    {
      summary: z.string(),
      duration: z.string().optional(),
      artifacts: z.array(z.string()).optional(),
      next_actions: z.array(z.string()).optional(),
      visibility: z.enum(["private", "team", "public"]).optional(),
      importance: z.enum(ImportanceLevel).default("medium"),
    },
    async ({ summary, duration, artifacts, next_actions, visibility, importance }) => {
      warnDeprecated(
        "capture_session",
        "Use kg_capture_session instead; this alias will be removed in a future release.",
      );
      logToolCall("capture_session", { summary, duration, artifacts, next_actions, visibility, importance });
      const content = [
        `Session Summary: ${summary}`,
        duration ? `Duration: ${duration}` : undefined,
        artifacts?.length ? `Artifacts: ${artifacts.join(", ")}` : undefined,
        next_actions?.length ? `Next Actions: ${next_actions.join("; ")}` : undefined,
      ]
        .filter(Boolean)
        .join("\n");
      const node = storage.createNode({
        content,
        type: "session",
        tags: ["session"],
        visibility,
        importance,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ accepted: true, node }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "kg_get_node",
    "Retrieves a specific knowledge node by its unique ID. Use to fetch detailed information about a particular node including its content, metadata, tags, and relationships.",
    { id: z.string()
        .describe("Unique identifier of the knowledge node to retrieve") },
    async ({ id }) => {
      logToolCall("kg_get_node", { id });
      const node = storage.getNode(id);
      return {
        content: [{ type: "text", text: JSON.stringify({ node }, null, 2) }],
      };
    },
  );

  server.tool(
    "kg_list_recent",
    {
      limit: z.number().int().min(1).max(100).default(20),
      format: z.enum(["full", "summary", "minimal"]).optional(),
      includeContent: z.boolean().optional(),
      includeTags: z.boolean().optional(),
      includeMetadata: z.boolean().optional(),
      summaryLength: z.number().int().min(1).max(2000).optional(),
    },
    async ({ limit, format, includeContent, includeTags, includeMetadata, summaryLength }) => {
      logToolCall("kg_list_recent", { limit, format, includeContent, includeTags, includeMetadata, summaryLength });
      const nodes = storage.listRecent(limit);
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

  // Convenience aliases for summary/minimal formatting
  server.tool(
    "kg_list_recent_summary",
    { limit: z.number().int().min(1).max(100).default(20), summaryLength: z.number().int().min(1).max(2000).optional() },
    async ({ limit, summaryLength }) => {
      warnDeprecated(
        "kg_list_recent_summary",
        "Use kg_list_recent with format=\"summary\" and optional summaryLength instead; this convenience tool will be removed in a future release.",
      );
      logToolCall("kg_list_recent_summary", { limit, summaryLength });
      const nodes = storage.listRecent(limit);
      const payload = { total: nodes.length, nodes: formatNodes(nodes, { format: "summary", summaryLength }) } as const;
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    },
  );

  server.tool(
    "kg_list_recent_minimal",
    { limit: z.number().int().min(1).max(100).default(20) },
    async ({ limit }) => {
      warnDeprecated(
        "kg_list_recent_minimal",
        "Use kg_list_recent with format=\"minimal\" instead; this convenience tool will be removed in a future release.",
      );
      logToolCall("kg_list_recent_minimal", { limit });
      const nodes = storage.listRecent(limit);
      const payload = { total: nodes.length, nodes: formatNodes(nodes, { format: "minimal" }) } as const;
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    },
  );

  server.tool(
    "kg_create_edge",
    "Creates explicit relationships between knowledge nodes. Use this to link related ideas, mark dependencies, or establish conceptual connections. Relationships are automatically scored for strength based on content similarity.",
    {
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
    },
    async ({ fromNodeId, toNodeId, relation }) => {
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
    },
  );

  // Dependency markers and convenience relations
  server.tool(
    "kg_mark_blocks",
    { sourceId: z.string(), targetId: z.string() },
    async ({ sourceId, targetId }) => {
      warnDeprecated(
        "kg_mark_blocks",
        "Use kg_create_edge with relation=\"blocks\" instead; this wrapper will be removed in a future release.",
      );
      logToolCall("kg_mark_blocks", { sourceId, targetId });
      const a = storage.getNode(sourceId);
      const b = storage.getNode(targetId);
      const s = a && b ? scoreRelationship(a, b) : undefined;
      const edge = storage.createEdge(sourceId, targetId, "blocks", { strength: s });
      return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    },
  );

  server.tool(
    "kg_mark_blocked_by",
    { targetId: z.string(), blockerId: z.string() },
    async ({ targetId, blockerId }) => {
      warnDeprecated(
        "kg_mark_blocked_by",
        "Use kg_create_edge with relation=\"blocks\" instead; this wrapper will be removed in a future release.",
      );
      logToolCall("kg_mark_blocked_by", { targetId, blockerId });
      const a = storage.getNode(blockerId);
      const b = storage.getNode(targetId);
      const s = a && b ? scoreRelationship(a, b) : undefined;
      const edge = storage.createEdge(blockerId, targetId, "blocks", { strength: s });
      return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    },
  );

  server.tool(
    "kg_mark_derived_from",
    { childId: z.string(), parentId: z.string() },
    async ({ childId, parentId }) => {
      // kept for ergonomics; consider deprecation in a later pass
      logToolCall("kg_mark_derived_from", { childId, parentId });
      const a = storage.getNode(childId);
      const b = storage.getNode(parentId);
      const s = a && b ? scoreRelationship(a, b) : undefined;
      const edge = storage.createEdge(childId, parentId, "derived_from", { strength: s });
      return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    },
  );

  server.tool(
    "kg_mark_affects",
    { sourceId: z.string(), targetId: z.string() },
    async ({ sourceId, targetId }) => {
      warnDeprecated(
        "kg_mark_affects",
        "Use kg_create_edge with relation=\"references\" instead; this wrapper will be removed in a future release.",
      );
      logToolCall("kg_mark_affects", { sourceId, targetId });
      const a = storage.getNode(sourceId);
      const b = storage.getNode(targetId);
      const s = a && b ? scoreRelationship(a, b) : undefined;
      const edge = storage.createEdge(sourceId, targetId, "references", { strength: s });
      return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    },
  );

  server.tool(
    "kg_list_edges",
    "Lists all relationships (edges) in the knowledge graph, optionally filtered by a specific node. Use to explore connections between knowledge nodes and understand the graph structure.",
    { 
      nodeId: z.string().optional()
        .describe("Optional node ID to filter edges - if provided, shows only edges connected to this node")
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

  server.tool(
    "kg_rebuild_relationships",
    {
      threshold: z.number().min(0).max(1).default(0.35),
      limit: z.number().int().min(1).max(10000).default(1000),
    },
    async ({ threshold, limit }) => {
      warnDeprecated(
        "kg_rebuild_relationships",
        "Use kg_relationships_maintenance with rebuildThreshold instead; this tool will be removed in a future release.",
      );
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
    },
  );

  // Maintenance wrapper: rebuild then prune
  server.tool(
    "kg_relationships_maintenance",
    {
      rebuildThreshold: z.number().min(0).max(1).default(0.35),
      pruneThreshold: z.number().min(0).max(1).default(0.15),
      limit: z.number().int().min(1).max(10000).default(1000),
    },
    async ({ rebuildThreshold, pruneThreshold, limit }) => {
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
        if (!f.endsWith(".json")) continue;
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
    },
  );

  server.tool(
    "kg_prune_weak_relationships",
    { threshold: z.number().min(0).max(1).default(0.15) },
    async ({ threshold }) => {
      warnDeprecated(
        "kg_prune_weak_relationships",
        "Use kg_relationships_maintenance with pruneThreshold instead; this tool will be removed in a future release.",
      );
      logToolCall("kg_prune_weak_relationships", { threshold });
      const fs = await import("node:fs");
      const path = await import("node:path");
      const edgesDir = storage.getEdgesDir();
      let removed = 0;
      for (const f of fs.readdirSync(edgesDir)) {
        if (!f.endsWith(".json")) continue;
        const p = path.join(edgesDir, f);
        const e = JSON.parse(fs.readFileSync(p, "utf8"));
        if (typeof e.strength === "number" && e.strength < threshold) {
          fs.rmSync(p);
          removed++;
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ removed }, null, 2) }],
      };
    },
  );

  // Batch reclassification: walk edges and recompute relation type and strength
  server.tool(
    "kg_reclassify_relationships",
    { limit: z.number().int().min(1).max(10000).default(2000) },
    async ({ limit }) => {
      warnDeprecated(
        "kg_reclassify_relationships",
        "Use kg_relationships_maintenance (rebuilds + prunes) or a future reclassify mode; this tool will be removed in a future release.",
      );
      logToolCall("kg_reclassify_relationships", { limit });
      const fs = await import("node:fs");
      const path = await import("node:path");
      const edgesDir = storage.getEdgesDir();
      const nodeCache = new Map<string, ReturnType<typeof storage.getNode>>();
      function getNode(id: string) {
        let n = nodeCache.get(id);
        if (!n) {
          n = storage.getNode(id);
          nodeCache.set(id!, n);
        }
        return n;
      }
      const files = fs
        .readdirSync(edgesDir)
        .filter((f) => f.endsWith(".json"))
        .slice(0, limit);
      let updated = 0;
      for (const f of files) {
        const p = path.join(edgesDir, f);
        const e = JSON.parse(fs.readFileSync(p, "utf8"));
        const a = getNode(e.fromNodeId);
        const b = getNode(e.toNodeId);
        if (!a || !b) continue;
        const s = scoreRelationship(a, b);
        const relation = classifyRelationship(a, b);
        const evidence = [JSON.stringify(computeStrengthFactors(a, b))];
        const updatedEdge = { ...e, relation, strength: s, evidence };
        fs.writeFileSync(p, JSON.stringify(updatedEdge, null, 2), "utf8");
        updated++;
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ updated }, null, 2) }],
      };
    },
  );

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

  server.tool(
    "kg_search_summary",
    {
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      type: z.enum(KnowledgeNodeType).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      summaryLength: z.number().int().min(1).max(2000).optional(),
    },
    async ({ query, tags, type, limit, summaryLength }) => {
      warnDeprecated(
        "kg_search_summary",
        "Use kg_search with format=\"summary\" and optional summaryLength instead; this convenience tool will be removed in a future release.",
      );
      logToolCall("kg_search_summary", { query, tags, type, limit, summaryLength });
      const all = storage.searchNodes({ query, tags, type, limit: 200 });
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
      const payload = { total: nodes.length, nodes: formatNodes(nodes, { format: "summary", summaryLength }) } as const;
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    },
  );

  server.tool(
    "kg_search_minimal",
    {
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      type: z.enum(KnowledgeNodeType).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ query, tags, type, limit }) => {
      warnDeprecated(
        "kg_search_minimal",
        "Use kg_search with format=\"minimal\" instead; this convenience tool will be removed in a future release.",
      );
      logToolCall("kg_search_minimal", { query, tags, type, limit });
      const all = storage.searchNodes({ query, tags, type, limit: 200 });
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
      const payload = { total: nodes.length, nodes: formatNodes(nodes, { format: "minimal" }) } as const;
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    },
  );

  server.tool(
    "kg_semantic_search",
    "Performs AI-powered semantic search using vector similarity. Finds knowledge nodes based on meaning and context rather than exact keywords. Returns most conceptually similar results ranked by relevance.",
    { query: z.string()
        .describe("Natural language search query. Be descriptive - this uses AI to find semantically similar content, not just keyword matches."),
      limit: z.number().int().min(1).max(50).default(10)
        .describe("Maximum number of results to return. More results = broader coverage but less relevance.") },
    async ({ query, limit }) => {
      logToolCall("kg_semantic_search", { query, limit });
      const q = embedText(query, EMBED_DIM);
      let results: Array<{ id: string; score: number; snippet: string }> = [];
      if (USE_ANN) {
        const top = ann.search(q, limit * 3);
        const nodesById = new Map(storage.listAllNodes().map((n) => [n.id, n] as const));
        results = top
          .map(({ id, score }) => ({ id, score, node: nodesById.get(id) }))
          .filter((r) => r.node)
          .slice(0, limit)
          .map((r) => ({ id: r.id, score: r.score, snippet: r.node!.content.slice(0, 160) }));
      } else {
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
    },
  );

  server.tool(
    "kg_find_similar",
    { nodeId: z.string(), limit: z.number().int().min(1).max(50).default(10) },
    async ({ nodeId, limit }) => {
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
    },
  );

  server.tool(
    "kg_backup",
    "Creates a backup of the entire knowledge graph with configurable retention. Use for data protection and to maintain historical snapshots of your knowledge base.",
    { 
      retentionDays: z.number().int().min(0).max(365).default(30)
        .describe("Number of days to keep backup files before automatic deletion (0 = keep forever)")
    },
    async ({ retentionDays }) => {
      logToolCall("kg_backup", { retentionDays });
      const res = storage.backup(retentionDays);
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
      };
    },
  );

  server.tool(
    "kg_validate",
    "Performs integrity validation on the knowledge graph data. Use to check for corrupted nodes, broken relationships, or other data consistency issues.",
    {},
    async () => {
      logToolCall("kg_validate");
      const res = storage.validate();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "kg_repair",
    "Attempts to repair common data integrity issues in the knowledge graph. Use after validation to fix corrupted nodes or broken relationships automatically.",
    {},
    async () => {
      logToolCall("kg_repair");
      const res = storage.repair();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

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

  // Expanded query: simple synonym expansion and unioned summary
  server.tool("kg_query_context_expanded", { topic: z.string() }, async ({ topic }) => {
    warnDeprecated(
      "kg_query_context_expanded",
      "Use kg_query_context; the expanded variant does not add value currently and will be removed in a future release.",
    );
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

  // Project state using proj:/ws:/ticket: tags and blocks edges
  server.tool(
    "kg_get_project_state",
    "Provides a comprehensive overview of a project's current state including active focus areas, recent decisions, open questions, blockers, and completed tasks. Perfect for project status checks and planning.",
    { project: z.string()
        .describe("Project name to analyze (will be normalized to 'proj:project-name' tag format)") },
    async ({ project }) => {
    logToolCall("kg_get_project_state", { project });
    const projTag = `proj:${project.trim().toLowerCase().replace(/\s+/g, "-")}`;
    const nodes = storage.searchNodes({ tags: [projTag], limit: 200 });
    const edges = storage.listEdges();
    const blockers = new Set<string>();
    for (const e of edges) if (e.relation === "blocks") blockers.add(e.toNodeId);
    // Rank by recency + tag density for project tag
    const now = Date.now();
    const ranked = [...nodes].map((n) => {
      const ageDays = Math.max(0, (now - Date.parse(n.updatedAt || n.createdAt)) / (1000 * 60 * 60 * 24));
      const recency = Math.max(0, 1 - ageDays / 30);
      const tagDensity = n.tags.includes(projTag) ? 1 : 0; // project-tag presence boost
      const score = recency * 0.8 + tagDensity * 0.2;
      return { n, score };
    }).sort((a, b) => b.score - a.score).map((x) => x.n);
    const currentFocus = ranked.slice(0, 5).map((n) => n.content.split("\n")[0]);
    const recentDecisions = nodes.filter((n) => n.type === "decision").slice(0, 5);
    const activeQuestions = nodes.filter((n) => n.type === "question").slice(0, 5);
    const blockerNodes = nodes.filter((n) => blockers.has(n.id)).slice(0, 10);
    const completedTasks = nodes
      .filter((n) => /\b(done|completed|finished|resolved)\b/i.test(n.content))
      .slice(0, 10);
    const payload = {
      project: projTag,
      currentFocus,
      recentDecisions,
      activeQuestions,
      blockers: blockerNodes,
      completedTasks,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  });

  // Generate attention alerts from dashboard data
  function generateAttentionAlerts(dashboardResult: any): any[] {
    const alerts = [];
    const { metrics, timeline } = dashboardResult;
    
    // Rapid context switching alert
    if (metrics.contextSwitches > 5) {
      alerts.push({
        type: 'rapid_switching',
        severity: metrics.contextSwitches > 10 ? 'high' : 'medium',
        message: `High fragmentation: ${metrics.contextSwitches} context switches detected`,
        suggestion: 'Consider batching related tasks to reduce context switching',
        affectedBranches: [...new Set(timeline.map((t: any) => t.branch))],
        timeframe: 'recent'
      });
    }
    
    // Focus drift alert
    if (metrics.focusDuration < 15) {
      alerts.push({
        type: 'focus_drift',
        severity: 'medium',
        message: `Low focus duration: average ${metrics.focusDuration} minutes per session`,
        suggestion: 'Try to maintain focus on single tasks for longer periods',
        affectedBranches: [...new Set(timeline.map((t: any) => t.branch))],
        timeframe: 'recent'
      });
    }
    
    // Inactive branches alert
    const activeBranches = new Set(timeline.map((t: any) => t.branch));
    if (activeBranches.size > 3) {
      alerts.push({
        type: 'inactive_branch',
        severity: 'low',
        message: `Multiple active branches: ${activeBranches.size} branches in recent activity`,
        suggestion: 'Consider consolidating work on fewer branches',
        affectedBranches: Array.from(activeBranches),
        timeframe: 'recent'
      });
    }
    
    return alerts;
  }

  // Enhanced session warmup aggregator: combines project state, recent activity, and workstream dashboard for comprehensive context
  server.tool(
    "kg_session_warmup",
    "Start every session with this tool! Loads comprehensive context about your project including recent work, active questions, blockers, and dashboard metrics. Essential for maintaining continuity between work sessions.",
    {
      project: z.string()
        .describe("Project name (will be normalized to 'proj:project-name' tag format)"),
      workstream: z.string().optional()
        .describe("Optional workstream within the project for more focused context"),
      limit: z.number().int().min(1).max(100).default(20)
        .describe("Number of recent nodes to include in the warmup context"),
      includeDashboard: z.boolean().default(false)
        .describe("Whether to include workstream dashboard data (timeline, metrics, context switches)"),
      dashboardTimeWindow: z.enum(["1h", "8h", "24h", "week"]).default("24h")
        .describe("Time window for dashboard data: '1h', '8h', '24h', or 'week'"),
      dashboardFormat: z.enum(["timeline", "summary", "both"]).default("summary")
        .describe("Dashboard output format: 'timeline' for chronological view, 'summary' for overview, 'both' for complete data"),
      showAttentionAlerts: z.boolean().default(true)
        .describe("Whether to show alerts about context switching, focus drift, and branch management"),
    },
    async ({ project, workstream, limit, includeDashboard, dashboardTimeWindow, dashboardFormat, showAttentionAlerts }) => {
      logToolCall("kg_session_warmup", { project, workstream, limit, includeDashboard, dashboardTimeWindow, dashboardFormat, showAttentionAlerts });

      // Build project tag and gather all nodes
      const projTag = `proj:${project.trim().toLowerCase().replace(/\s+/g, "-")}`;
      const nodes = storage.listAllNodes();

      // Recent nodes across the entire KG
      const recent = [...nodes]
        .sort(
          (a, b) =>
            Date.parse(b.updatedAt || b.createdAt) -
            Date.parse(a.updatedAt || a.createdAt),
        )
        .slice(0, limit);

      // Project-specific nodes
      const projectNodes = storage.searchNodes({ tags: [projTag], limit: 200 });
      const edges = storage.listEdges();
      const blockers = new Set<string>();
      for (const e of edges) if (e.relation === "blocks") blockers.add(e.toNodeId);

      // Rank project nodes by simple recency + tag density heuristic
      const now = Date.now();
      const ranked = projectNodes
        .map((n) => {
          const ageDays = Math.max(
            0,
            (now - Date.parse(n.updatedAt || n.createdAt)) /
              (1000 * 60 * 60 * 24),
          );
          const recency = Math.max(0, 1 - ageDays / 30);
          const tagDensity = n.tags.includes(projTag) ? 1 : 0;
          const score = recency * 0.8 + tagDensity * 0.2;
          return { n, score };
        })
        .sort((a, b) => b.score - a.score)
        .map((x) => x.n);

      const currentFocus = ranked.slice(0, 5).map((n) => n.content.split("\n")[0]);
      const recentDecisions = projectNodes
        .filter((n) => n.type === "decision")
        .slice(0, 5);
      const activeQuestions = projectNodes
        .filter((n) => n.type === "question")
        .slice(0, 5);
      const blockerNodes = projectNodes.filter((n) => blockers.has(n.id)).slice(0, 10);
      const completedTasks = projectNodes
        .filter((n) => /\b(done|completed|finished|resolved)\b/i.test(n.content))
        .slice(0, 10);

      // Enhanced payload with dashboard integration
      const payload: any = {
        project: projTag,
        workstream,
        currentFocus,
        recentDecisions,
        activeQuestions,
        blockers: blockerNodes,
        completedTasks,
        recent,
      };

      // Include workstream dashboard data if requested
      if (includeDashboard) {
        try {
          // Import the workstream dashboard service
          const { WorkstreamDashboardService } = await import("./services/workstreamDashboard.js");
          
          // Create dashboard service instance
          const dashboardService = new WorkstreamDashboardService(nodes);
          
          // Generate dashboard data
          const dashboardResult = await dashboardService.generateDashboard({
            timeWindow: dashboardTimeWindow,
            showContextSwitches: true,
            showMetrics: true,
            maxEntries: 30,
            outputFormat: dashboardFormat
          });

          // Add dashboard data to payload
          payload.dashboard = {
            timeWindow: dashboardTimeWindow,
            timeline: dashboardResult.timeline.slice(0, 10), // Limit for warmup
            metrics: dashboardResult.metrics,
            formattedOutput: dashboardResult.formattedOutput
          };

          // Generate attention alerts if requested
          if (showAttentionAlerts) {
            const alerts = generateAttentionAlerts(dashboardResult);
            payload.attentionAlerts = alerts;
          }

        } catch (error) {
          console.warn("Failed to include dashboard in session warmup:", error);
          payload.dashboard = { error: "Dashboard data unavailable" };
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  // Code-aware query: match by file path fragment and optional function name
  server.tool(
    "kg_query_code",
    "Searches for knowledge related to specific code files or functions. Use to find decisions, insights, or progress related to particular code components.",
    { 
      filePath: z.string()
        .describe("Path to the code file to search for (e.g., 'src/components/Button.tsx', 'api/auth.ts')"),
      functionName: z.string().optional()
        .describe("Optional function name to narrow the search scope")
    },
    async ({ filePath, functionName }) => {
      logToolCall("kg_query_code", { filePath, functionName });
      const fragment = filePath.split(/[\\/]/).slice(-2).join("/").toLowerCase();
      const nodes = storage.listAllNodes();
      const results = nodes.filter((n) => {
        const hay = (n.content + "\n" + n.tags.join(" ")).toLowerCase();
        const fileMatch = hay.includes(fragment) || hay.includes(filePath.toLowerCase());
        const fnMatch = functionName ? hay.includes(functionName.toLowerCase()) : true;
        return fileMatch && fnMatch;
      });
      const payload = { total: results.length, results: results.slice(0, 50) };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  // Connection path (BFS up to maxDepth)
  server.tool(
    "kg_find_connection_path",
    "Finds the shortest path between two knowledge nodes through their relationships. Use to discover how different ideas or work items are connected in the knowledge graph.",
    { 
      startId: z.string()
        .describe("ID of the starting knowledge node"),
      endId: z.string()
        .describe("ID of the target knowledge node to find path to"),
      maxDepth: z.number().int().min(1).max(6).default(4)
        .describe("Maximum number of relationship hops to search (higher = broader search but slower)")
    },
    async ({ startId, endId, maxDepth }) => {
      logToolCall("kg_find_connection_path", { startId, endId, maxDepth });
      if (startId === endId)
        return { content: [{ type: "text", text: JSON.stringify({ path: [startId], edges: [] }, null, 2) }] };
      const edges = storage.listEdges();
      const adj = new Map<string, { to: string; edgeId: string }[]>();
      for (const e of edges) {
        if (!adj.has(e.fromNodeId)) adj.set(e.fromNodeId, []);
        adj.get(e.fromNodeId)!.push({ to: e.toNodeId, edgeId: e.id });
        if (!adj.has(e.toNodeId)) adj.set(e.toNodeId, []);
        adj.get(e.toNodeId)!.push({ to: e.fromNodeId, edgeId: e.id });
      }
      const queue: string[] = [startId];
      const parent = new Map<string, { prev: string; edgeId: string }>();
      const depth = new Map<string, number>([[startId, 0]]);
      while (queue.length) {
        const cur = queue.shift()!;
        const d = depth.get(cur)!;
        if (d >= maxDepth) continue;
        for (const nxt of adj.get(cur) ?? []) {
          if (depth.has(nxt.to)) continue;
          depth.set(nxt.to, d + 1);
          parent.set(nxt.to, { prev: cur, edgeId: nxt.edgeId });
          if (nxt.to === endId) {
            const path: string[] = [endId];
            const usedEdges: string[] = [];
            let at = endId;
            while (at !== startId) {
              const p = parent.get(at)!;
              usedEdges.push(p.edgeId);
              path.push(p.prev);
              at = p.prev;
            }
            path.reverse();
            usedEdges.reverse();
            const payload = { path, edges: usedEdges };
            return {
              content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
              structuredContent: payload,
            };
          }
          queue.push(nxt.to);
        }
      }
      return { content: [{ type: "text", text: JSON.stringify({ path: [], edges: [], found: false }, null, 2) }] };
    },
  );

  // Alias for compatibility: query_context
  server.tool("query_context", { query: z.string() }, async ({ query }) => {
    warnDeprecated(
      "query_context",
      "Use kg_query_context instead; this alias will be removed in a future release.",
    );
    logToolCall("query_context", { query });
    const summary = reconstructContext(storage.listAllNodes(), query);
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  });

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

  server.tool(
    "kg_import",
    "Imports knowledge graph data from a previously exported format. Use to restore backups, migrate data, or merge knowledge from different sources.",
    { 
      payload: z.string()
        .describe("JSON string containing the exported knowledge graph data to import")
    },
    async ({ payload }) => {
      logToolCall("kg_import", { payload: `string(len=${payload.length})` });
      const data = JSON.parse(payload);
      const result = storage.importAll(data);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, ...result }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "kg_delete_node",
    "Removes a knowledge node and optionally its relationships from the graph. Use to clean up outdated, incorrect, or redundant information.",
    { 
      id: z.string()
        .describe("ID of the knowledge node to delete"),
      deleteEdges: z.boolean().default(true)
        .describe("Whether to also delete all relationships connected to this node")
    },
    async ({ id, deleteEdges }) => {
      logToolCall("kg_delete_node", { id, deleteEdges });
      const deleted = storage.deleteNode(id);
      const edgesDeleted = deleteEdges ? storage.deleteEdgesForNode(id) : 0;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ deleted, edgesDeleted }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "kg_workstream_dashboard",
    {
      timeWindow: z.enum(["1h", "8h", "24h", "week"]).default("24h"),
      showContextSwitches: z.boolean().default(true),
      showMetrics: z.boolean().default(true),
      maxEntries: z.number().int().min(1).max(200).default(50),
      outputFormat: z.enum(["timeline", "summary", "both"]).default("both"),
    },
    async ({ timeWindow, showContextSwitches, showMetrics, maxEntries, outputFormat }) => {
      logToolCall("kg_workstream_dashboard", { timeWindow, showContextSwitches, showMetrics, maxEntries, outputFormat });
      
      try {
        const nodes = storage.listAllNodes();
        const dashboardService = new WorkstreamDashboardService(nodes);
        
        const result = await dashboardService.generateDashboard({
          timeWindow,
          showContextSwitches,
          showMetrics,
          maxEntries,
          outputFormat,
        });
        
        return {
          content: [
            {
              type: "text",
              text: result.formattedOutput,
            },
          ],
        };
      } catch (error) {
        console.error("[PKG] Workstream dashboard error:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error generating workstream dashboard: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  return server;
}

async function main() {
  const server = createPersonalKgServer();
  // Optional auto-backup scheduler controlled by env
  const minutes = Number(process.env.PKG_AUTO_BACKUP_MINUTES ?? "0");
  const retention = Number(process.env.PKG_BACKUP_RETENTION_DAYS ?? "30");
  if (Number.isFinite(minutes) && minutes > 0) {
    const storageForBackup = new FileStorage({
      baseDir: process.env.PKG_STORAGE_DIR ?? ".kg",
    });
    setInterval(
      () => {
        try {
          storageForBackup.backup(Number.isFinite(retention) ? retention : 30);
        } catch {
          // ignore scheduler errors
        }
      },
      minutes * 60 * 1000,
    );
  }
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Run only when executed directly
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export type { McpServer };
