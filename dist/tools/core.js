// Core Personal KG MCP Tools
// Contains the essential tools: kg_health, kg_capture, kg_capture_session
import { z } from "zod";
import { getHealth } from "../handlers/health.js";
import { ImportanceLevel, KnowledgeNodeType } from "../types/enums.js";
import { findAutoLinks } from "../utils/autoLink.js";
import { embedText } from "../utils/embeddings.js";
import { scoreRelationship } from "../utils/relationships.js";
// Helper functions
function normalizeTagString(s) {
    return s.trim().replace(/\s+/g, "-").toLowerCase();
}
function normalizeTags(base, project, workstream, ticket) {
    const set = new Set();
    for (const t of base ?? []) {
        if (typeof t === "string" && t.trim().length > 0)
            set.add(normalizeTagString(t));
    }
    if (project && project.trim())
        set.add(`proj:${normalizeTagString(project)}`);
    if (workstream && workstream.trim())
        set.add(`ws:${normalizeTagString(workstream)}`);
    if (ticket && ticket.trim())
        set.add(`ticket:${normalizeTagString(ticket)}`);
    return Array.from(set);
}
function getWorkstreamTag(tags) {
    return tags.find((t) => t.toLowerCase().startsWith("ws:"));
}
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
export const PERSONAL_KG_TOOLS = ["kg_health", "kg_capture"];
export function setupCoreTools(server, storage, ann, // TODO: Type this properly
USE_ANN, EMBED_DIM) {
    // Basic health tool
    server.tool(PERSONAL_KG_TOOLS[0], "Provides system health status and diagnostic information about the Personal KG. Use to check if the knowledge graph is functioning properly, verify storage integrity, and get basic system metrics.", {}, async () => {
        logToolCall("kg_health");
        const { result } = getHealth();
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
    });
    // Primary capture tool
    server.tool(PERSONAL_KG_TOOLS[1], "Primary tool for capturing knowledge nodes. Use this to record decisions, progress updates, insights, questions, and ideas. Automatically creates relationships, normalizes tags, and links to sessions. This is your main entry point for adding knowledge to the graph.", {
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
    }, async (args) => {
        logToolCall("kg_capture", args);
        let git;
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
            }
            catch {
                // ignore git errors; leave git undefined
            }
        }
        const normalizedTags = normalizeTags(args.tags, args.project, args.workstream, args.ticket);
        const input = {
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
            }
            catch { }
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
            }
            catch { }
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
        importance: z.enum(ImportanceLevel).default("medium")
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
    });
    // Session linking tool
    server.tool("kg_link_session", "Creates a relationship between a session node and another knowledge node. Use to explicitly link work items, decisions, or progress to a specific session for better organization.", {
        sessionId: z.string()
            .describe("ID of the session node to link from"),
        nodeId: z.string()
            .describe("ID of the knowledge node to link to the session")
    }, async ({ sessionId, nodeId }) => {
        logToolCall("kg_link_session", { sessionId, nodeId });
        const a = storage.getNode(sessionId);
        const b = storage.getNode(nodeId);
        const s = a && b ? scoreRelationship(a, b) : undefined;
        const edge = storage.createEdge(sessionId, nodeId, "references", { strength: s });
        return { content: [{ type: "text", text: JSON.stringify({ edge }, null, 2) }] };
    });
    // Deprecated aliases
    server.tool("capture_context", {
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
    }, async (args) => {
        warnDeprecated("capture_context", "Use kg_capture instead; this alias will be removed in a future release.");
        logToolCall("capture_context", args);
        // Reuse the same logic as kg_capture
        let git;
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
            }
            catch {
                // ignore git errors; leave git undefined
            }
        }
        const normalizedTags = normalizeTags(args.tags, args.project, args.workstream, args.ticket);
        const input = {
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
            }
            catch { }
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
            }
            catch { }
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
    });
    server.tool("capture_session", {
        summary: z.string(),
        duration: z.string().optional(),
        artifacts: z.array(z.string()).optional(),
        next_actions: z.array(z.string()).optional(),
        visibility: z.enum(["private", "team", "public"]).optional(),
        importance: z.enum(ImportanceLevel).default("medium"),
    }, async ({ summary, duration, artifacts, next_actions, visibility, importance }) => {
        warnDeprecated("capture_session", "Use kg_capture_session instead; this alias will be removed in a future release.");
        logToolCall("capture_session", { summary, duration, artifacts, next_actions, visibility, importance });
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
    });
}
