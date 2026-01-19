// Maintenance Personal KG MCP Tools
// Contains consolidated admin and maintenance tools

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { getHealth } from "../handlers/health.js";
import { generateEmbeddingBatch, isOpenAIAvailable } from "../utils/openai-embeddings.js";

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

// Admin operation types
const AdminOperation = [
  "health",
  "backup",
  "validate",
  "repair",
  "export",
  "import",
  "rename_tag",
  "merge_tags",
  "migrate_embeddings"
] as const;

export function setupMaintenanceTools(
  server: McpServer,
  storage: FileStorage
): void {
  // =============================================================================
  // CONSOLIDATED ADMIN TOOL
  // Replaces: kg_health, kg_backup, kg_validate, kg_repair, kg_export, kg_import,
  //           kg_rename_tag, kg_merge_tags
  // =============================================================================
  server.tool(
    "kg_admin",
    "Unified admin tool for maintenance operations. Supports: 'health' for system status, 'backup' for data protection, 'validate' for integrity checks, 'repair' for fixing issues, 'export'/'import' for data migration, 'rename_tag'/'merge_tags' for tag management, 'migrate_embeddings' for backfilling OpenAI embeddings.",
    {
      operation: z.enum(AdminOperation)
        .describe("Admin operation: 'health', 'backup', 'validate', 'repair', 'export', 'import', 'rename_tag', 'merge_tags'."),

      // backup options
      retentionDays: z.number().int().min(0).max(365).default(30).optional()
        .describe("[backup] Days to keep backups before deletion (0 = forever)."),

      // import options
      payload: z.string().optional()
        .describe("[import] JSON string of exported knowledge graph data."),

      // rename_tag options
      oldTag: z.string().optional()
        .describe("[rename_tag] Tag to rename (exact match)."),
      newTag: z.string().optional()
        .describe("[rename_tag] New tag name."),

      // merge_tags options
      sourceTags: z.array(z.string()).optional()
        .describe("[merge_tags] Tags to merge (will be removed)."),
      targetTag: z.string().optional()
        .describe("[merge_tags] Tag to merge into."),

      // migrate_embeddings options
      batchSize: z.number().int().min(1).max(100).default(20).optional()
        .describe("[migrate_embeddings] Number of nodes to process per batch."),
      force: z.boolean().default(false).optional()
        .describe("[migrate_embeddings] Regenerate embeddings even for nodes that already have them."),

      // shared options
      dryRun: z.boolean().default(false).optional()
        .describe("[rename_tag, merge_tags] Preview changes without applying."),
    },
    async (args) => {
      const { operation, retentionDays = 30, payload, oldTag, newTag, sourceTags, targetTag, dryRun = false, batchSize = 20, force = false } = args;
      logToolCall("kg_admin", { operation, retentionDays, oldTag, newTag, sourceTags, targetTag, dryRun, batchSize, force });

      switch (operation) {
        case "health":
          return handleHealth();

        case "backup":
          return handleBackup(storage, retentionDays);

        case "validate":
          return handleValidate(storage);

        case "repair":
          return handleRepair(storage);

        case "export":
          return handleExport(storage);

        case "import":
          return handleImport(storage, payload);

        case "rename_tag":
          return handleRenameTag(storage, oldTag, newTag, dryRun);

        case "merge_tags":
          return handleMergeTags(storage, sourceTags, targetTag, dryRun);

        case "migrate_embeddings":
          return handleMigrateEmbeddings(storage, batchSize, force);

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
// ADMIN OPERATION HANDLERS
// =============================================================================

async function handleHealth() {
  const { result } = getHealth();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ operation: "health", ...result }, null, 2),
      },
    ],
  };
}

async function handleBackup(storage: FileStorage, retentionDays: number) {
  const backup = storage.backup(retentionDays);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          operation: "backup",
          success: true,
          backup: { backupDir: backup.backupDir, retentionDays },
          message: `Backup created successfully with ${retentionDays} day retention`
        }, null, 2),
      },
    ],
  };
}

async function handleValidate(storage: FileStorage) {
  const validation = storage.validate();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ operation: "validate", ...validation }, null, 2),
      },
    ],
  };
}

async function handleRepair(storage: FileStorage) {
  const repair = storage.repair();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          operation: "repair",
          success: true,
          ...repair,
          message: `Repair complete: ${repair.removedNodes} corrupted nodes removed, ${repair.removedEdges} broken edges removed`
        }, null, 2),
      },
    ],
  };
}

async function handleExport(storage: FileStorage) {
  const exportData = storage.exportAll();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ operation: "export", ...exportData }, null, 2),
      },
    ],
  };
}

async function handleImport(storage: FileStorage, payload?: string) {
  if (!payload) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "payload is required for import operation" }, null, 2),
        },
      ],
    };
  }

  try {
    const importData = JSON.parse(payload);
    const result = storage.importAll(importData);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            operation: "import",
            success: true,
            ...result,
            message: `Import complete: ${result.nodes} nodes imported, ${result.edges} edges imported`
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            operation: "import",
            success: false,
            error: "Invalid import data format",
            details: error instanceof Error ? error.message : "Unknown error"
          }, null, 2),
        },
      ],
    };
  }
}

async function handleRenameTag(storage: FileStorage, oldTag?: string, newTag?: string, dryRun: boolean = false) {
  if (!oldTag || !newTag) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "oldTag and newTag are required for rename_tag operation" }, null, 2),
        },
      ],
    };
  }

  if (oldTag === newTag) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "oldTag and newTag are the same" }, null, 2),
        },
      ],
    };
  }

  const nodes = storage.listAllNodes();
  const affected = nodes.filter((n) => n.tags.includes(oldTag));

  if (!dryRun) {
    for (const node of affected) {
      const newTags = node.tags.map((t) => (t === oldTag ? newTag : t));
      // Deduplicate in case newTag already exists
      storage.updateNode(node.id, { tags: [...new Set(newTags)] });
    }
  }

  const payload = {
    operation: "rename_tag",
    success: true,
    nodesUpdated: affected.length,
    oldTag,
    newTag,
    dryRun,
    affectedNodeIds: affected.map((n) => n.id),
  };

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

async function handleMergeTags(storage: FileStorage, sourceTags?: string[], targetTag?: string, dryRun: boolean = false) {
  if (!sourceTags || sourceTags.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "sourceTags array is required and cannot be empty" }, null, 2),
        },
      ],
    };
  }

  if (!targetTag) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "targetTag is required for merge_tags operation" }, null, 2),
        },
      ],
    };
  }

  const nodes = storage.listAllNodes();
  const affected = nodes.filter((n) =>
    n.tags.some((t) => sourceTags.includes(t))
  );

  if (!dryRun) {
    for (const node of affected) {
      const newTags = node.tags
        .filter((t) => !sourceTags.includes(t))
        .concat(targetTag);
      // Deduplicate
      storage.updateNode(node.id, { tags: [...new Set(newTags)] });
    }
  }

  const payload = {
    operation: "merge_tags",
    success: true,
    nodesUpdated: affected.length,
    sourceTags,
    targetTag,
    dryRun,
    affectedNodeIds: affected.map((n) => n.id),
  };

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

async function handleMigrateEmbeddings(storage: FileStorage, batchSize: number, force: boolean) {
  // Check if OpenAI is available
  if (!isOpenAIAvailable()) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            operation: "migrate_embeddings",
            success: false,
            error: "OpenAI API not configured. Set OPENAI_API_KEY environment variable.",
          }, null, 2),
        },
      ],
    };
  }

  const nodes = storage.listAllNodes();

  // Filter nodes that need embeddings
  const nodesToMigrate = force
    ? nodes
    : nodes.filter(n => !n.embedding || n.embedding.length === 0);

  if (nodesToMigrate.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            operation: "migrate_embeddings",
            success: true,
            totalNodes: nodes.length,
            nodesWithEmbeddings: nodes.filter(n => n.embedding && n.embedding.length > 0).length,
            migrated: 0,
            message: "All nodes already have embeddings. Use force=true to regenerate.",
          }, null, 2),
        },
      ],
    };
  }

  let migrated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < nodesToMigrate.length; i += batchSize) {
    const batch = nodesToMigrate.slice(i, i + batchSize);

    // Prepare texts for batch embedding (content + tags)
    const texts = batch.map(n => n.content + " " + n.tags.join(" "));

    try {
      const embeddings = await generateEmbeddingBatch(texts);

      // Store embeddings
      for (let j = 0; j < batch.length; j++) {
        const node = batch[j];
        const embedding = embeddings[j];

        if (embedding) {
          const success = storage.updateNodeEmbedding(node.id, embedding);
          if (success) {
            migrated++;
          } else {
            failed++;
            errors.push(`Failed to store embedding for node ${node.id}`);
          }
        } else {
          failed++;
          errors.push(`Failed to generate embedding for node ${node.id}`);
        }
      }
    } catch (error) {
      // Batch failed - count all as failed
      failed += batch.length;
      errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Log progress
    console.error(`[PKG] migrate_embeddings: processed ${Math.min(i + batchSize, nodesToMigrate.length)}/${nodesToMigrate.length} nodes`);
  }

  const payload = {
    operation: "migrate_embeddings",
    success: failed === 0,
    totalNodes: nodes.length,
    nodesNeedingMigration: nodesToMigrate.length,
    migrated,
    failed,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit errors shown
    message: failed === 0
      ? `Successfully migrated ${migrated} node embeddings`
      : `Migrated ${migrated} nodes with ${failed} failures`,
  };

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
