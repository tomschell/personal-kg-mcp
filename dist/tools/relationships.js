// Relationship Personal KG MCP Tools
// Contains relationship management tools
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
