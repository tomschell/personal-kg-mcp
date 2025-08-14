// Project Personal KG MCP Tools
// Contains project state, session warmup, dashboard tools
import { z } from "zod";
// Workstream dashboard removed per spec
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
// Dashboard-related logic removed per spec
export function setupProjectTools(server, storage) {
    // Get project state
    server.tool("kg_get_project_state", "Provides a comprehensive overview of a project's current state including active focus areas, recent decisions, open questions, blockers, and completed tasks. Perfect for project status checks and planning.", { project: z.string()
            .describe("Project name to analyze (will be normalized to 'proj:project-name' tag format)") }, async ({ project }) => {
        logToolCall("kg_get_project_state", { project });
        const projTag = `proj:${project.trim().toLowerCase().replace(/\s+/g, "-")}`;
        const nodes = storage.searchNodes({ tags: [projTag], limit: 200 });
        const edges = storage.listEdges();
        const blockers = new Set();
        for (const e of edges)
            if (e.relation === "blocks")
                blockers.add(e.toNodeId);
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
    // Session warmup
    server.tool("kg_session_warmup", "Start every session with this tool! Loads comprehensive context about your project including recent work, active questions, and blockers. Essential for maintaining continuity between work sessions.", {
        project: z.string()
            .describe("Project name (will be normalized to 'proj:project-name' tag format)"),
        limit: z.number().int().min(1).max(100).default(20)
            .describe("Number of recent nodes to include in the warmup context"),
    }, async ({ project, limit }) => {
        logToolCall("kg_session_warmup", { project, limit });
        // Build project tag and gather all nodes
        const projTag = `proj:${project.trim().toLowerCase().replace(/\s+/g, "-")}`;
        const nodes = storage.listAllNodes();
        // Recent nodes across the entire KG
        const recent = [...nodes]
            .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) -
            Date.parse(a.updatedAt || a.createdAt))
            .slice(0, limit);
        // Project-specific nodes
        const projectNodes = storage.searchNodes({ tags: [projTag], limit: 200 });
        const edges = storage.listEdges();
        const blockers = new Set();
        for (const e of edges)
            if (e.relation === "blocks")
                blockers.add(e.toNodeId);
        // Rank project nodes by simple recency + tag density heuristic
        const now = Date.now();
        const ranked = projectNodes
            .map((n) => {
            const ageDays = Math.max(0, (now - Date.parse(n.updatedAt || n.createdAt)) /
                (1000 * 60 * 60 * 24));
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
        const payload = {
            project: projTag,
            currentFocus,
            recentDecisions,
            activeQuestions,
            blockers: blockerNodes,
            completedTasks,
            recent,
        };
        return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
        };
    });
    // Workstream dashboard tool removed per spec
}
