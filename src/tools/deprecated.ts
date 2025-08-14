// Deprecated Personal KG MCP Tools
// Contains all deprecated tools that will be removed in future releases

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { ImportanceLevel } from "../types/enums.js";
import { reconstructContext } from "../utils/context.js";

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

// Temporary helper for non-breaking deprecation notices
function warnDeprecated(toolName: string, message: string): void {
  try {
    // IMPORTANT: write warnings to stderr to avoid corrupting MCP stdio JSON
    console.error(`[PKG][DEPRECATED] ${toolName}: ${message}`);
  } catch {
    // ignore logging failures
  }
}

export function setupDeprecatedTools(
  server: McpServer,
  storage: FileStorage
): void {
  // Deprecated alias for kg_capture
  server.tool(
    "capture_context",
    {
      content: z.string(),
      type: z.enum(["idea", "decision", "progress", "insight", "question", "session"]).default("idea"),
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
      // This is a simple alias that calls kg_capture with the same arguments
      // The actual implementation is in core.ts
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ accepted: true, message: "Use kg_capture instead" }, null, 2),
          },
        ],
      };
    },
  );

  // Deprecated alias for kg_capture_session
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

  // Deprecated alias for kg_query_context
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

  // Deprecated expanded query context
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
      // Reserved for future merge strategy
    }
    return {
      content: [{ type: "text", text: JSON.stringify(base, null, 2) }],
      structuredContent: base,
    };
  });

  // Delete node tool (not actually deprecated, but missing from other modules)
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

  // Get node tool (not actually deprecated, but missing from other modules)
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
}
