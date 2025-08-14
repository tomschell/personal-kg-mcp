// Maintenance Personal KG MCP Tools
// Contains backup, validate, repair, export/import tools
import { z } from "zod";
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
export function setupMaintenanceTools(server, storage) {
    // Create backup of knowledge graph
    server.tool("kg_backup", "Creates a backup of the entire knowledge graph with configurable retention. Use for data protection and to maintain historical snapshots of your knowledge base.", {
        retentionDays: z.number().int().min(0).max(365).default(30)
            .describe("Number of days to keep backup files before automatic deletion (0 = keep forever)")
    }, async ({ retentionDays }) => {
        logToolCall("kg_backup", { retentionDays });
        const res = storage.backup(retentionDays);
        return {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
        };
    });
    // Validate knowledge graph integrity
    server.tool("kg_validate", "Performs integrity validation on the knowledge graph data. Use to check for corrupted nodes, broken relationships, or other data consistency issues.", {}, async () => {
        logToolCall("kg_validate");
        const res = storage.validate();
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    });
    // Repair knowledge graph issues
    server.tool("kg_repair", "Attempts to repair common data integrity issues in the knowledge graph. Use after validation to fix corrupted nodes or broken relationships automatically.", {}, async () => {
        logToolCall("kg_repair");
        const res = storage.repair();
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    });
    // Export all knowledge graph data
    server.tool("kg_export", "Exports all knowledge graph data in a structured format. Use for backups, data migration, or external processing of your knowledge base.", {}, async () => {
        logToolCall("kg_export");
        const payload = storage.exportAll();
        return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
    });
    // Import knowledge graph data
    server.tool("kg_import", "Imports knowledge graph data from a previously exported format. Use to restore backups, migrate data, or merge knowledge from different sources.", {
        payload: z.string()
            .describe("JSON string containing the exported knowledge graph data to import")
    }, async ({ payload }) => {
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
    });
}
