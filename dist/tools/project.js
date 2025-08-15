// Project Personal KG MCP Tools
// Contains project management and session tools
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
export function setupProjectTools(server, storage) {
    // Get project state
    server.tool("kg_get_project_state", "Provides a comprehensive overview of a project's current state including active focus areas, recent decisions, open questions, blockers, and completed tasks. Perfect for project status checks and planning.", {
        project: z.string().describe("Project name to analyze (will be normalized to 'proj:project-name' tag format)"),
    }, async ({ project }) => {
        logToolCall("kg_get_project_state", { project });
        const projectTag = `proj:${project.toLowerCase().replace(/\s+/g, "-")}`;
        const nodes = storage.searchNodes({ tags: [projectTag], limit: 100 });
        const state = {
            project,
            totalNodes: nodes.length,
            recentDecisions: nodes.filter(n => n.type === "decision").slice(0, 5),
            openQuestions: nodes.filter(n => n.type === "question").slice(0, 5),
            blockers: nodes.filter(n => n.tags.includes("blocker")).slice(0, 5),
            completedTasks: nodes.filter(n => n.tags.includes("completed")).slice(0, 5),
            activeFocus: nodes.filter(n => n.tags.includes("active")).slice(0, 5)
        };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(state, null, 2),
                },
            ],
        };
    });
    // Session warmup
    server.tool("kg_session_warmup", "Start every session with this tool! Loads comprehensive context about your project including recent work, active questions, and blockers. Essential for maintaining continuity between work sessions.", {
        project: z.string().describe("Project name (will be normalized to 'proj:project-name' tag format)"),
        workstream: z.string().optional().describe("Optional workstream within the project for more focused context"),
        limit: z.number().int().min(1).max(100).default(20).describe("Number of recent nodes to include in the warmup context"),
    }, async ({ project, workstream, limit }) => {
        logToolCall("kg_session_warmup", { project, workstream, limit });
        const projectTag = `proj:${project.toLowerCase().replace(/\s+/g, "-")}`;
        const tags = [projectTag];
        if (workstream) {
            tags.push(`ws:${workstream.toLowerCase().replace(/\s+/g, "-")}`);
        }
        const recentNodes = storage.searchNodes({ tags, limit });
        const questions = storage.searchNodes({ tags, type: "question", limit: 5 });
        const blockers = storage.searchNodes({ tags: [...tags, "blocker"], limit: 5 });
        const warmup = {
            project,
            workstream,
            recentWork: recentNodes.slice(0, limit),
            openQuestions: questions,
            blockers,
            sessionStart: new Date().toISOString()
        };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(warmup, null, 2),
                },
            ],
        };
    });
    // Get specific node
    server.tool("kg_get_node", "Retrieves a specific knowledge node by its unique ID. Use to fetch detailed information about a particular node including its content, metadata, tags, and relationships.", {
        id: z.string().describe("Unique identifier of the knowledge node to retrieve"),
    }, async ({ id }) => {
        logToolCall("kg_get_node", { id });
        const node = storage.getNode(id);
        if (!node) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ error: "Node not found" }, null, 2),
                    },
                ],
            };
        }
        const edges = storage.listEdges(id);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ node, relationships: edges }, null, 2),
                },
            ],
        };
    });
    // Delete node
    server.tool("kg_delete_node", "Removes a knowledge node and optionally its relationships from the graph. Use to clean up outdated, incorrect, or redundant information.", {
        id: z.string().describe("ID of the knowledge node to delete"),
        deleteEdges: z.boolean().default(true).describe("Whether to also delete all relationships connected to this node"),
    }, async ({ id, deleteEdges }) => {
        logToolCall("kg_delete_node", { id, deleteEdges });
        const node = storage.getNode(id);
        if (!node) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ error: "Node not found" }, null, 2),
                    },
                ],
            };
        }
        let deletedEdgesCount = 0;
        if (deleteEdges) {
            deletedEdgesCount = storage.deleteEdgesForNode(id);
        }
        storage.deleteNode(id);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        deletedNode: id,
                        deletedEdges: deletedEdgesCount
                    }, null, 2),
                },
            ],
        };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        deletedNode: id,
                        deletedEdges: deleteEdges ? "all" : "none"
                    }, null, 2),
                },
            ],
        };
    });
    // Session capture tool
    server.tool("kg_capture_session", "Captures session summaries with structured metadata. Use at the end of work sessions to record what was accomplished, artifacts created, and next actions. Essential for maintaining context between sessions and tracking progress over time.", {
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
        importance: z.enum(["high", "medium", "low"]).default("medium")
            .describe("Session importance: 'high' for major milestones, 'medium' for regular work, 'low' for minor sessions."),
    }, async ({ summary, duration, artifacts, next_actions, visibility, importance, }) => {
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
            importance: importance || "medium", // Ensure default value is set
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ accepted: true, node }, null, 2),
                },
            ],
        };
    });
}
