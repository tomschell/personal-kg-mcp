import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ImportanceLevel, KnowledgeNodeType } from "../types/enums.js";
import { FileStorage } from "../storage/FileStorage.js";
import type { CreateNodeInput } from "../types/domain.js";
import { findAutoLinks } from "../utils/autoLink.js";
import { embedText } from "../utils/embeddings.js";
import { generateEmbedding, isOpenAIAvailable } from "../utils/openai-embeddings.js";
import { AnnIndex } from "../utils/ann.js";
import { scoreRelationship } from "../utils/relationships.js";

export const PERSONAL_KG_TOOLS = ["kg_capture", "kg_update_node"] as const;

export function setupCoreTools(
  server: McpServer,
  storage: FileStorage,
  ann: AnnIndex,
  USE_ANN: boolean,
  EMBED_DIM: number,
  normalizeTags: (base?: string[], project?: string, workstream?: string, ticket?: string) => string[],
  getWorkstreamTag: (tags: string[]) => string | undefined,
  logToolCall: (name: string, args?: unknown) => void
) {
  // Primary capture tool
  server.tool(
    "kg_capture",
    "Primary tool for capturing knowledge nodes. Use this to record decisions, progress updates, insights, questions, and ideas. Automatically creates relationships, normalizes tags, and links to sessions. This is your main entry point for adding knowledge to the graph.",
    {
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
    },
    async (args) => {
      logToolCall("kg_capture", args);
      let git: CreateNodeInput["git"] | undefined;
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
        } catch {
          // ignore git errors; leave git undefined
        }
      }
      const normalizedTags = normalizeTags(
        args.tags as string[] | undefined,
        args.project,
        args.workstream,
        args.ticket,
      );
      const input: CreateNodeInput = {
        content: args.content,
        type: args.type,
        tags: normalizedTags,
        visibility: args.visibility,
        git,
        importance: args.importance,
      };
      const node = storage.createNode(input);

      // Generate and store OpenAI embedding if available
      if (isOpenAIAvailable()) {
        try {
          // Include tags in the embedding text for better semantic matching
          const textToEmbed = node.content + " " + node.tags.join(" ");
          const embedding = await generateEmbedding(textToEmbed);
          if (embedding) {
            storage.updateNodeEmbedding(node.id, embedding);
            // Update node reference with embedding for return value
            node.embedding = embedding;
          }
        } catch (err) {
          console.error("[PKG] Failed to generate embedding:", err);
        }
      }

      // Incremental ANN insert (for local bag-of-words fallback)
      if (USE_ANN) {
        try {
          ann.add(node.id, embedText(node.content, EMBED_DIM));
        } catch {}
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
        } catch {}
      }
      // Auto-link progress entries within same workstream
      if (node.type === "progress") {
        const wsTag = getWorkstreamTag(node.tags);
        if (wsTag) {
          const recentSameWs = storage
            .searchNodes({ tags: [wsTag], type: "progress", limit: 20 })
            .filter((n: any) => n.id !== node.id);
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
    },
  );

  // Session linking tool
  server.tool(
    "kg_link_session",
    "Creates a relationship between a session node and another knowledge node. Use to explicitly link work items, decisions, or progress to a specific session for better organization.",
    {
      sessionId: z.string()
        .describe("ID of the session node to link from"),
      nodeId: z.string()
        .describe("ID of the knowledge node to link to the session"),
    },
    async ({ sessionId, nodeId }) => {
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
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Failed to link session" }, null, 2),
            },
          ],
        };
      }
    },
  );

  // Node update tool
  server.tool(
    "kg_update_node",
    "Updates an existing knowledge node. Use to modify content, tags, importance, or visibility of a node. Supports partial updates - only specified fields are changed.",
    {
      id: z.string()
        .describe("ID of the node to update"),
      content: z.string().optional()
        .describe("Replace the node's content entirely"),
      appendContent: z.string().optional()
        .describe("Append text to the existing content"),
      tags: z.array(z.string()).optional()
        .describe("Replace all tags with this array"),
      mergeTags: z.array(z.string()).optional()
        .describe("Add these tags to existing tags (set union)"),
      removeTags: z.array(z.string()).optional()
        .describe("Remove these specific tags"),
      visibility: z.enum(["private", "team", "public"]).optional()
        .describe("Update visibility level"),
      importance: z.enum(ImportanceLevel).optional()
        .describe("Update importance level"),
    },
    async (args) => {
      logToolCall("kg_update_node", args);

      const existingNode = storage.getNode(args.id);
      if (!existingNode) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Node not found", id: args.id }, null, 2),
            },
          ],
        };
      }

      const updatedNode = storage.updateNode(args.id, {
        content: args.content,
        appendContent: args.appendContent,
        tags: args.tags,
        mergeTags: args.mergeTags,
        removeTags: args.removeTags,
        visibility: args.visibility,
        importance: args.importance,
      });

      if (!updatedNode) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Failed to update node" }, null, 2),
            },
          ],
        };
      }

      // Re-embed if content changed
      if (args.content || args.appendContent) {
        // Regenerate OpenAI embedding
        if (isOpenAIAvailable()) {
          try {
            const textToEmbed = updatedNode.content + " " + updatedNode.tags.join(" ");
            const embedding = await generateEmbedding(textToEmbed);
            if (embedding) {
              storage.updateNodeEmbedding(updatedNode.id, embedding);
              updatedNode.embedding = embedding;
            }
          } catch (err) {
            console.error("[PKG] Failed to regenerate embedding:", err);
          }
        }
        // Update ANN index for local fallback
        if (USE_ANN) {
          try {
            ann.add(updatedNode.id, embedText(updatedNode.content, EMBED_DIM));
          } catch {}
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, node: updatedNode }, null, 2),
          },
        ],
      };
    },
  );
}
