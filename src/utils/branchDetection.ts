import type { KnowledgeNode } from "../types/domain.js";

export interface BranchActivity {
  branch: string; // e.g., "proj:kg/ws:kg-dev"
  commits: {
    id: string;
    type: string;
    timeAgo: number; // minutes
    tags: string[];
  }[];
  status: "active" | "recent" | "idle";
  lastActivity: number; // minutes ago
}

export interface TimelineEntry {
  branch: string;
  type: string;
  timeAgo: number;
  contextSwitch: boolean;
  nodeId: string;
  tags: string[];
}

export interface TimelineOutput {
  timeline: TimelineEntry[];
  metrics: {
    contextSwitches: number;
    activeBranches: number;
    focusDuration: number; // average minutes per branch
  };
}

/**
 * Extract branch identifier from KG node tags
 * Looks for patterns like proj:*, ws:*, issue:* and combines them
 * Returns "main" for general work without specific project/issue tags
 */
export function extractBranchFromTags(tags: string[]): string | null {
  const projectTags = tags.filter(t => t.startsWith("proj:"));
  const workstreamTags = tags.filter(t => t.startsWith("ws:"));
  const issueTags = tags.filter(t => t.startsWith("issue:"));
  
  // If no specific project/workstream/issue tags, this is main branch work
  if (projectTags.length === 0 && workstreamTags.length === 0 && issueTags.length === 0) {
    return "main";
  }
  
  const parts: string[] = [];
  
  // Add project if present
  if (projectTags.length > 0) {
    parts.push(projectTags[0]); // Use first project tag
  }
  
  // Add workstream if present
  if (workstreamTags.length > 0) {
    parts.push(workstreamTags[0]); // Use first workstream tag
  }
  
  // Add issue if present and no workstream
  if (issueTags.length > 0 && workstreamTags.length === 0) {
    parts.push(issueTags[0]); // Use first issue tag
  }
  
  return parts.join("/");
}

/**
 * Calculate time ago in minutes from ISO timestamp
 */
export function getTimeAgoMinutes(timestamp: string): number {
  const now = new Date();
  const nodeTime = new Date(timestamp);
  const diffMs = now.getTime() - nodeTime.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

/**
 * Detect context switches and completed work in timeline
 * A context switch occurs when the branch changes between consecutive entries
 * Completed work is detected based on node types and tags
 */
export function detectContextSwitches(timeline: TimelineEntry[]): TimelineEntry[] {
  if (timeline.length <= 1) {
    return timeline;
  }
  
  const result = [...timeline];
  
  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    const previous = result[i - 1];
    
    // Mark as context switch if branch changed
    current.contextSwitch = current.branch !== previous.branch;
    
    // Detect completed work that should flow back to main
    if (isCompletedWork(current) && current.branch !== "main") {
      // Create a merge commit to main
      const mergeEntry: TimelineEntry = {
        branch: "main",
        type: "merge",
        timeAgo: current.timeAgo + 1, // Slightly after the completion
        contextSwitch: true,
        nodeId: `merge-${current.nodeId}`,
        tags: [...current.tags, "merge", "completed"]
      };
      
      // Insert merge entry after current entry
      result.splice(i + 1, 0, mergeEntry);
      i++; // Skip the newly inserted entry in next iteration
    }
  }
  
  return result;
}

/**
 * Determine if a timeline entry represents completed work
 */
function isCompletedWork(entry: TimelineEntry): boolean {
  // Check for completion indicators in tags
  const completionTags = ["completed", "done", "finished", "resolved", "closed"];
  const hasCompletionTag = entry.tags.some(tag => 
    completionTags.some(completionTag => 
      tag.toLowerCase().includes(completionTag)
    )
  );
  
  // Check for completion indicators in type
  const completionTypes = ["decision", "progress", "insight"];
  const hasCompletionType = completionTypes.includes(entry.type);
  
  // Check for issue completion patterns
  const hasIssueCompletion = entry.tags.some(tag => 
    tag.startsWith("issue:") && (
      tag.includes("closed") || 
      tag.includes("resolved") || 
      tag.includes("completed")
    )
  );
  
  return hasCompletionTag || hasCompletionType || hasIssueCompletion;
}

/**
 * Group nodes by branch and calculate activity status
 */
export function groupNodesByBranch(nodes: KnowledgeNode[]): Map<string, BranchActivity> {
  const branchMap = new Map<string, BranchActivity>();
  
  for (const node of nodes) {
    const branch = extractBranchFromTags(node.tags);
    if (!branch) continue;
    
    const timeAgo = getTimeAgoMinutes(node.createdAt);
    
    if (!branchMap.has(branch)) {
      branchMap.set(branch, {
        branch,
        commits: [],
        status: "idle",
        lastActivity: timeAgo
      });
    }
    
    const activity = branchMap.get(branch)!;
    activity.commits.push({
      id: node.id,
      type: node.type,
      timeAgo,
      tags: node.tags
    });
    
    // Update last activity
    if (timeAgo < activity.lastActivity) {
      activity.lastActivity = timeAgo;
    }
  }
  
  // Calculate status for each branch
  for (const activity of branchMap.values()) {
    if (activity.lastActivity <= 60) { // Within last hour
      activity.status = "active";
    } else if (activity.lastActivity <= 480) { // Within last 8 hours
      activity.status = "recent";
    } else {
      activity.status = "idle";
    }
  }
  
  return branchMap;
}

/**
 * Build timeline from nodes with context switch detection
 */
export function buildTimeline(nodes: KnowledgeNode[]): TimelineOutput {
  // Sort nodes by creation time (newest first)
  const sortedNodes = [...nodes].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Build timeline entries
  const timeline: TimelineEntry[] = [];
  
  for (const node of sortedNodes) {
    const branch = extractBranchFromTags(node.tags);
    if (!branch) continue;
    
    timeline.push({
      branch,
      type: node.type,
      timeAgo: getTimeAgoMinutes(node.createdAt),
      contextSwitch: false, // Will be set by detectContextSwitches
      nodeId: node.id,
      tags: node.tags
    });
  }
  
  // Detect context switches
  const timelineWithSwitches = detectContextSwitches(timeline);
  
  // Calculate metrics
  const contextSwitches = timelineWithSwitches.filter(entry => entry.contextSwitch).length;
  const uniqueBranches = new Set(timelineWithSwitches.map(entry => entry.branch)).size;
  
  // Calculate average focus duration
  let totalFocusTime = 0;
  let focusPeriods = 0;
  let currentBranch = "";
  let branchStartTime = 0;
  
  for (const entry of timelineWithSwitches) {
    if (entry.branch !== currentBranch) {
      if (currentBranch !== "") {
        totalFocusTime += entry.timeAgo - branchStartTime;
        focusPeriods++;
      }
      currentBranch = entry.branch;
      branchStartTime = entry.timeAgo;
    }
  }
  
  const avgFocusDuration = focusPeriods > 0 ? Math.round(totalFocusTime / focusPeriods) : 0;
  
  return {
    timeline: timelineWithSwitches,
    metrics: {
      contextSwitches,
      activeBranches: uniqueBranches,
      focusDuration: avgFocusDuration
    }
  };
}

/**
 * Aggregate branch activity from timeline entries
 */
export function aggregateBranchActivity(timeline: TimelineEntry[]): BranchActivity[] {
  const branchMap = new Map<string, BranchActivity>();
  
  for (const entry of timeline) {
    if (!branchMap.has(entry.branch)) {
      branchMap.set(entry.branch, {
        branch: entry.branch,
        commits: [],
        status: "idle",
        lastActivity: entry.timeAgo
      });
    }
    
    const activity = branchMap.get(entry.branch)!;
    activity.commits.push({
      id: entry.nodeId,
      type: entry.type,
      timeAgo: entry.timeAgo,
      tags: entry.tags
    });
    
    // Update last activity (smaller number = more recent)
    if (entry.timeAgo < activity.lastActivity) {
      activity.lastActivity = entry.timeAgo;
    }
  }
  
  // Calculate status for each branch
  for (const activity of branchMap.values()) {
    if (activity.lastActivity <= 60) { // Within last hour
      activity.status = "active";
    } else if (activity.lastActivity <= 480) { // Within last 8 hours
      activity.status = "recent";
    } else {
      activity.status = "idle";
    }
  }
  
  return Array.from(branchMap.values());
}
