import { z } from "zod";
import { ImportanceLevel, KnowledgeNodeType } from "../types/enums.js";
import { getHealth } from "../handlers/health.js";
import { findAutoLinks } from "../utils/autoLink.js";
import { embedText } from "../utils/embeddings.js";
import { scoreRelationship } from "../utils/relationships.js";
export const PERSONAL_KG_TOOLS = ["kg_health", "kg_capture"];
export function setupCoreTools(server, storage, ann, USE_ANN, EMBED_DIM, normalizeTags, getWorkstreamTag, logToolCall) {
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
    // Session linking tool
    server.tool("kg_link_session", "Creates a relationship between a session node and another knowledge node. Use to explicitly link work items, decisions, or progress to a specific session for better organization.", {
        sessionId: z.string()
            .describe("ID of the session node to link from"),
        nodeId: z.string()
            .describe("ID of the knowledge node to link to the session"),
    }, async ({ sessionId, nodeId }) => {
        logToolCall("kg_link_session", { sessionId, nodeId });
        try {
            const session = storage.getNode(sessionId);
            const node = storage.getNode(nodeId);
            if (!session || session.type !== "session") {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ error: "Session not found or invalid session type" }, null, 2),
                        },
                    ],
                };
            }
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
            const strength = scoreRelationship(session, node);
            storage.createEdge(sessionId, nodeId, "references", { strength });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ accepted: true, sessionId, nodeId, strength }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ error: "Failed to link session" }, null, 2),
                    },
                ],
            };
        }
    });
}
