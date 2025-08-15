// Deprecated Personal KG MCP Tools
// Contains all deprecated tools that will be removed in future releases

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";

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
  // TODO: Implement deprecated tools
  // This will include all tools marked for deprecation
  // These tools will be removed in future releases
}
