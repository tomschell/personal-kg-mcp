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

// Temporary helper for non-breaking deprecation notices
function warnDeprecated(toolName: string, message: string): void {
  try {
    // IMPORTANT: write warnings to stderr to avoid corrupting MCP stdio JSON
    console.error(`[PKG][DEPRECATED] ${toolName}: ${message}`);
  } catch {
    // ignore logging failures
  }
}

export function setupRelationshipTools(
  server: McpServer,
  storage: FileStorage
): void {
  // TODO: Implement relationship tools
  // This will include:
  // - kg_create_edge
  // - kg_mark_blocks
  // - kg_mark_blocked_by
  // - kg_mark_derived_from
  // - kg_mark_affects
  // - kg_list_edges
  // - kg_rebuild_relationships
  // - kg_relationships_maintenance
  // - kg_prune_weak_relationships
  // - kg_reclassify_relationships
}
