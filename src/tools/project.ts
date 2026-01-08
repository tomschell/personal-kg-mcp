// Project Personal KG MCP Tools
// Contains project management and session tools

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FileStorage } from "../storage/FileStorage.js";
import { getGitHubState, getCurrentBranch } from "../utils/github.js";
import { isGitHubEnabled, getGitHubToken } from "../config/KGConfig.js";
import { selectSmartContext } from "../utils/sessionContext.js";
import { embedText, cosineSimilarity } from "../utils/embeddings.js";

// Helper functions for discovery mode
interface ProjectSummary {
  name: string;
  nodeCount: number;
  lastActivity: string;
  recentWork: string[];
  status: "very-active" | "moderate" | "light" | "inactive";
}

interface RecentActivity {
  project: string;
  content: string;
  timestamp: string;
  type: string;
}

async function getAvailableProjects(storage: FileStorage): Promise<ProjectSummary[]> {
  const allNodes = storage.searchNodes({ limit: 1000 }); // Get all nodes for analysis
  
  // Extract all project tags
  const projectTags = new Set<string>();
  for (const node of allNodes) {
    for (const tag of node.tags) {
      if (tag.startsWith('proj:')) {
        projectTags.add(tag);
      }
    }
  }
  
  // Get activity stats for each project
  const projects: ProjectSummary[] = [];
  for (const projectTag of projectTags) {
    const projectName = projectTag.replace('proj:', '');
    const projectNodes = storage.searchNodes({ tags: [projectTag], limit: 100 });
    
    if (projectNodes.length === 0) continue;
    
    // Get recent work (last 3 items)
    const recentWork = projectNodes
      .slice(0, 3)
      .map(node => {
        const content = node.content.length > 100 
          ? node.content.substring(0, 100) + '...' 
          : node.content;
        return content;
      });
    
    // Determine activity status based on last activity and node count
    const lastActivity = projectNodes[0]?.updatedAt || new Date().toISOString();
    const hoursSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);
    
    let status: ProjectSummary['status'];
    if (hoursSinceActivity < 24 && projectNodes.length > 20) {
      status = 'very-active';
    } else if (hoursSinceActivity < 72 && projectNodes.length > 10) {
      status = 'moderate';
    } else if (hoursSinceActivity < 168 && projectNodes.length > 5) {
      status = 'light';
    } else {
      status = 'inactive';
    }
    
    projects.push({
      name: projectName,
      nodeCount: projectNodes.length,
      lastActivity,
      recentWork,
      status
    });
  }
  
  // Sort by activity (most recent first)
  return projects.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
}

async function getCrossProjectActivity(storage: FileStorage, limit: number = 10): Promise<RecentActivity[]> {
  const recentNodes = storage.searchNodes({ limit });
  
  return recentNodes.map(node => {
    const projectTag = node.tags.find(tag => tag.startsWith('proj:'));
    const project = projectTag ? projectTag.replace('proj:', '') : 'unknown';
    
    return {
      project,
      content: node.content.length > 80 ? node.content.substring(0, 80) + '...' : node.content,
      timestamp: node.updatedAt,
      type: node.type
    };
  });
}

async function handleDiscoveryMode(storage: FileStorage, limit: number) {
  const allNodes = storage.searchNodes({ limit: 1000 });
  
  // Check if knowledge graph is empty
  if (allNodes.length === 0) {
    const emptyResponse = {
      mode: "discovery",
      status: "empty",
      message: "🚀 SESSION WARMUP - GETTING STARTED",
      knowledgeGraph: "Empty (ready to capture your work!)",
      quickStart: [
        "1. kg_capture(content=\"Working on...\", project=\"your-project\") - Start documenting",
        "2. kg_session_warmup(discover=true) - Explore once you have data",
        "3. kg_session_warmup(project=\"project-name\") - Get focused context"
      ],
      tip: "The knowledge graph builds context as you capture decisions, progress, and insights!"
    };
    
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(emptyResponse, null, 2),
        },
      ],
    };
  }
  
  // Get project information
  const projects = await getAvailableProjects(storage);
  const recentActivity = await getCrossProjectActivity(storage, 10);
  
  // Get emerging concepts (tags that appear across multiple projects)
  const tagCounts = new Map<string, number>();
  for (const node of allNodes) {
    for (const tag of node.tags) {
      if (!tag.startsWith('proj:') && !tag.startsWith('ws:')) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }
  
  const emergingConcepts = Array.from(tagCounts.entries())
    .filter(([_, count]) => count >= 3) // At least 3 occurrences
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));
  
  const discoveryResponse = {
    mode: "discovery",
    status: "active",
    message: "🔍 PROJECT DISCOVERY",
    availableProjects: projects,
    recentActivity,
    emergingConcepts,
    nextSteps: [
      `Use kg_session_warmup(project="${projects[0]?.name || 'your-project'}") for detailed project context`,
      "Use kg_capture() to start documenting new work",
      "Use kg_session_warmup(discover=true) to explore again"
    ],
    sessionStart: new Date().toISOString()
  };
  
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(discoveryResponse, null, 2),
      },
    ],
  };
}

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

export function setupProjectTools(
  server: McpServer,
  storage: FileStorage
): void {
  // Get project state
  server.tool(
    "kg_get_project_state",
    "Provides a comprehensive overview of a project's current state including active focus areas, recent decisions, open questions, blockers, and completed tasks. Perfect for project status checks and planning.",
    {
      project: z.string().describe("Project name to analyze (will be normalized to 'proj:project-name' tag format)"),
    },
    async ({ project }) => {
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
    },
  );

  // Session warmup
  server.tool(
    "kg_session_warmup",
    "Start every session with this tool! Loads comprehensive context about your project including recent work, active questions, and blockers. Essential for maintaining continuity between work sessions.",
    {
      project: z.string().optional().describe("Project name (will be normalized to 'proj:project-name' tag format). Optional - if not provided, discovery mode is enabled."),
      workstream: z.string().optional().describe("Optional workstream within the project for more focused context"),
      limit: z.number().int().min(1).max(100).default(20).describe("Number of recent nodes to include in the warmup context"),
      discover: z.boolean().default(false).describe("Enable discovery mode to explore available projects and recent activity. Automatically enabled if no project specified."),
    },
    async ({ project, workstream, limit, discover }) => {
      logToolCall("kg_session_warmup", { project, workstream, limit, discover });
      
      // Enable discovery mode if no project specified or discover=true
      const shouldDiscover = !project || discover;
      
      if (shouldDiscover) {
        return await handleDiscoveryMode(storage, limit);
      }
      
      // Original project-specific warmup logic
      const projectTag = `proj:${project!.toLowerCase().replace(/\s+/g, "-")}`;
      const tags = [projectTag];
      if (workstream) {
        tags.push(`ws:${workstream.toLowerCase().replace(/\s+/g, "-")}`);
      }

      // Retrieve MORE nodes than needed for intelligent filtering
      const effectiveLimit = limit || 20; // Use default of 20 if not specified
      const candidateLimit = Math.max(effectiveLimit * 3, 60);
      const allCandidates = storage.searchNodes({ tags, limit: candidateLimit });

      // Apply smart context selection to prevent drowning from high-volume captures
      const smartContext = selectSmartContext(allCandidates, effectiveLimit);

      // Still explicitly fetch questions and blockers (already prioritized by smart selection)
      const questions = storage.searchNodes({ tags, type: "question", limit: 5 });
      const blockers = storage.searchNodes({ tags: [...tags, "blocker"], limit: 5 });

      // Get GitHub state integration (configurable)
      let githubState = null;
      let warnings: any[] = [];

      if (isGitHubEnabled()) {
        const currentBranch = getCurrentBranch();
        githubState = getGitHubState(currentBranch, smartContext.priorityNodes);
      }

      // Format clustered work summaries
      const clusteredWorkSummaries = smartContext.clusters
        .filter(c => c.type === "cluster" && c.summary)
        .map(c => ({
          summary: c.summary,
          count: c.nodes.length,
          importance: c.importance,
          representativeNode: c.representativeNode ? {
            id: c.representativeNode.id,
            content: c.representativeNode.content.substring(0, 150) + (c.representativeNode.content.length > 150 ? '...' : ''),
            type: c.representativeNode.type,
            updatedAt: c.representativeNode.updatedAt
          } : null
        }));

      const warmup = {
        project,
        workstream,
        recentWork: smartContext.priorityNodes,
        openQuestions: questions,
        blockers,
        // NEW: Smart context insights
        contextInsights: {
          totalCapturedNodes: smartContext.summary.totalNodes,
          displayedNodes: smartContext.priorityNodes.length,
          clusteredGroups: clusteredWorkSummaries.length,
          highVolumePatterns: smartContext.summary.highVolumePatterns,
          diversityApplied: smartContext.priorityNodes.length < allCandidates.length
        },
        // NEW: Grouped work summaries (shows patterns without drowning in details)
        groupedWork: clusteredWorkSummaries.length > 0 ? clusteredWorkSummaries : undefined,
        sessionStart: new Date().toISOString(),
        // NEW: GitHub state integration
        githubState,
        // IMPORTANT: Agent Training Reminders (NOT user-facing documentation)
        // These reminders train AI agents on proper development workflows during sessions.
        // They guide agent behavior for commit patterns, code quality, and best practices.
        // Users see these indirectly through improved agent behavior, not as direct guidance.
        agentTrainingReminders: {
          commitFrequency: [
            "🔄 Commit frequently - git hooks provide valuable feedback during development",
            "💡 Target: Commit after each logical change, not just at completion",
            "🎯 Use descriptive messages: 'Add validation logic for #310'",
            "⚡ Git hooks run on commit - frequent commits = early problem detection",
            "📋 Include issue numbers in commit messages for tracking and automation"
          ],
          currentIssueGuidance: "Remember to reference issue numbers in commit messages for tracking"
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(warmup, null, 2),
          },
        ],
      };
    },
  );

  // =============================================================================
  // CONSOLIDATED NODE TOOL
  // Replaces: kg_get_node, kg_delete_node, kg_find_similar
  // =============================================================================
  server.tool(
    "kg_node",
    "Unified tool for node operations. Supports three operations: 'get' to retrieve a node with its relationships, 'delete' to remove a node, 'find_similar' to find semantically similar nodes.",
    {
      operation: z.enum(["get", "delete", "find_similar"])
        .describe("Operation to perform: 'get' retrieves node details, 'delete' removes the node, 'find_similar' finds similar nodes."),
      id: z.string()
        .describe("ID of the knowledge node to operate on."),

      // delete operation options
      deleteEdges: z.boolean().default(true).optional()
        .describe("[delete] Whether to also delete all relationships connected to this node."),

      // find_similar operation options
      limit: z.number().int().min(1).max(50).default(10).optional()
        .describe("[find_similar] Maximum number of similar nodes to return."),
      threshold: z.number().min(0).max(1).default(0.15).optional()
        .describe("[find_similar] Minimum similarity score (0-1). Higher = stricter matching."),
    },
    async ({ operation, id, deleteEdges = true, limit = 10, threshold = 0.15 }) => {
      logToolCall("kg_node", { operation, id, deleteEdges, limit, threshold });

      switch (operation) {
        case "get":
          return handleGetNode(storage, id);

        case "delete":
          return handleDeleteNode(storage, id, deleteEdges);

        case "find_similar":
          return handleFindSimilar(storage, id, limit, threshold);

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

  // Session capture tool
  server.tool(
    "kg_capture_session",
    "Captures session summaries with structured metadata. Use at the end of work sessions to record what was accomplished, artifacts created, and next actions. Essential for maintaining context between sessions and tracking progress over time.",
    {
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
    },
    async ({
      summary,
      duration,
      artifacts,
      next_actions,
      visibility,
      importance,
    }) => {
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
    },
  );
}

// =============================================================================
// NODE OPERATION HANDLERS
// =============================================================================

async function handleGetNode(storage: FileStorage, id: string) {
  const node = storage.getNode(id);

  if (!node) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Node not found" }, null, 2),
        },
      ],
    };
  }

  const edges = storage.listEdges(id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ operation: "get", node, relationships: edges }, null, 2),
      },
    ],
  };
}

async function handleDeleteNode(storage: FileStorage, id: string, deleteEdges: boolean) {
  const node = storage.getNode(id);

  if (!node) {
    return {
      content: [
        {
          type: "text" as const,
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
        type: "text" as const,
        text: JSON.stringify({
          operation: "delete",
          success: true,
          deletedNode: id,
          deletedEdges: deletedEdgesCount
        }, null, 2),
      },
    ],
  };
}

async function handleFindSimilar(storage: FileStorage, id: string, limit: number, threshold: number) {
  const base = storage.getNode(id);

  if (!base) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Node not found", results: [] }, null, 2),
        },
      ],
    };
  }

  const v = embedText(base.content);
  const nodes = storage.listAllNodes().filter((n) => n.id !== id);
  const scored = nodes.map((n) => ({
    node: n,
    score: cosineSimilarity(v, embedText(n.content)),
  }));

  scored.sort((a, b) => b.score - a.score);
  const results = scored
    .filter((r) => r.score >= threshold)
    .slice(0, limit)
    .map((r) => ({
      id: r.node.id,
      score: r.score,
      snippet: r.node.content.slice(0, 160),
    }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ operation: "find_similar", total: results.length, results }, null, 2),
      },
    ],
  };
}

// =============================================================================
// QUESTION TRACKING TOOLS
// =============================================================================

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export function setupQuestionTools(
  server: McpServer,
  storage: FileStorage
): void {
  // Open Questions Tracker
  server.tool(
    "kg_open_questions",
    "Lists unresolved questions with aging information. Questions are considered 'stale' after 3 days. Use to track what needs follow-up and identify forgotten questions.",
    {
      project: z.string().optional()
        .describe("Filter by project name (will be normalized to 'proj:project-name' format)"),
      include_stale: z.boolean().default(true)
        .describe("Include questions older than 3 days (marked as stale)"),
      limit: z.number().int().min(1).max(50).default(10)
        .describe("Maximum number of questions to return"),
    },
    async ({ project, include_stale, limit }) => {
      logToolCall("kg_open_questions", { project, include_stale, limit });

      // Build search params
      const tags: string[] = [];
      if (project) {
        tags.push(`proj:${project.toLowerCase().replace(/\s+/g, "-")}`);
      }

      // Get all questions
      const questions = storage.searchNodes({
        type: "question",
        tags: tags.length > 0 ? tags : undefined,
        limit: 200, // Get more to filter
      });

      // Check which have resolution edges
      const unresolved = questions.filter(q => {
        const edges = storage.listEdges(q.id);
        return !edges.some(e => e.relation === "resolved_by");
      });

      // Calculate staleness and add metadata
      const withAge = unresolved.map(q => {
        const ageInDays = daysSince(q.createdAt);
        return {
          id: q.id,
          content: q.content,
          tags: q.tags,
          importance: q.importance || "medium",
          createdAt: q.createdAt,
          ageInDays,
          isStale: ageInDays > 3,
          ageLabel: ageInDays === 0 ? "today" :
                    ageInDays === 1 ? "yesterday" :
                    `${ageInDays} days ago`,
        };
      });

      // Filter by staleness if needed
      const filtered = include_stale
        ? withAge
        : withAge.filter(q => !q.isStale);

      // Sort by age (oldest first for attention)
      const sorted = filtered.sort((a, b) => b.ageInDays - a.ageInDays);
      const results = sorted.slice(0, limit);

      // Summary stats
      const staleCount = withAge.filter(q => q.isStale).length;
      const freshCount = withAge.filter(q => !q.isStale).length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              total: results.length,
              summary: {
                staleQuestions: staleCount,
                freshQuestions: freshCount,
                oldestDays: results[0]?.ageInDays || 0,
              },
              questions: results,
              tip: staleCount > 0
                ? `${staleCount} question(s) are stale (>3 days). Consider resolving or updating them.`
                : "All questions are fresh!",
            }, null, 2),
          },
        ],
      };
    },
  );

  // Resolve Question Tool
  server.tool(
    "kg_resolve_question",
    "Marks a question as resolved by linking it to a decision, insight, or other node that answers it. Creates a 'resolved_by' relationship.",
    {
      question_id: z.string()
        .describe("ID of the question node to resolve"),
      resolved_by_id: z.string()
        .describe("ID of the node that resolves this question (typically a decision or insight)"),
      resolution_note: z.string().optional()
        .describe("Optional note explaining how this resolves the question"),
    },
    async ({ question_id, resolved_by_id, resolution_note }) => {
      logToolCall("kg_resolve_question", { question_id, resolved_by_id, resolution_note });

      // Validate question exists and is a question
      const question = storage.getNode(question_id);
      if (!question) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Question not found", success: false }, null, 2),
            },
          ],
        };
      }

      if (question.type !== "question") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Node is not a question (type: ${question.type})`,
                success: false,
              }, null, 2),
            },
          ],
        };
      }

      // Validate resolution node exists
      const resolution = storage.getNode(resolved_by_id);
      if (!resolution) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Resolution node not found", success: false }, null, 2),
            },
          ],
        };
      }

      // Check if already resolved
      const existingEdges = storage.listEdges(question_id);
      const alreadyResolved = existingEdges.find(e => e.relation === "resolved_by");
      if (alreadyResolved) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                warning: "Question was already resolved",
                existingResolution: alreadyResolved.toNodeId,
                success: false,
              }, null, 2),
            },
          ],
        };
      }

      // Create resolution edge
      const edge = storage.createEdge(
        question_id,
        resolved_by_id,
        "resolved_by",
        {
          strength: 1.0,
          evidence: resolution_note ? [resolution_note] : ["Marked as resolved"],
        }
      );

      // Optionally add "resolved" tag to question
      const updatedQuestion = storage.updateNode(question_id, {
        mergeTags: ["resolved"],
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: "Question marked as resolved",
              question: {
                id: question_id,
                content: question.content.slice(0, 100) + (question.content.length > 100 ? "..." : ""),
              },
              resolvedBy: {
                id: resolved_by_id,
                type: resolution.type,
                content: resolution.content.slice(0, 100) + (resolution.content.length > 100 ? "..." : ""),
              },
              edge: {
                id: edge.id,
                relation: edge.relation,
              },
            }, null, 2),
          },
        ],
      };
    },
  );
}
