import type { BranchActivity, TimelineEntry, TimelineOutput } from "./branchDetection.js";

export interface TimelineFormatterOptions {
  timeWindow: "1h" | "8h" | "24h" | "week";
  showContextSwitches: boolean;
  showMetrics: boolean;
  maxEntries?: number;
}

/**
 * Format timeline entries into a readable text representation
 */
export function formatTimeline(
  timeline: TimelineEntry[],
  options: TimelineFormatterOptions
): string {
  const { timeWindow, showContextSwitches, showMetrics, maxEntries = 50 } = options;
  
  // Filter and limit entries
  const filteredTimeline = timeline.slice(0, maxEntries);
  
  let output = `# Workstream Dashboard - ${timeWindow} Timeline\n\n`;
  
  if (showMetrics) {
    const metrics = calculateMetrics(timeline);
    output += formatMetrics(metrics, timeWindow);
    output += "\n\n";
  }
  
  if (filteredTimeline.length === 0) {
    output += "*No activity in the selected time window*\n";
    return output;
  }
  
  // Group by branch for better readability
  const branchGroups = groupByBranch(filteredTimeline);
  
  for (const [branch, entries] of Object.entries(branchGroups)) {
    output += `## ${branch}\n\n`;
    
    for (const entry of entries) {
      const timeStr = formatTimeAgo(entry.timeAgo);
      const switchIndicator = entry.contextSwitch && showContextSwitches ? " 🔄" : "";
      
      output += `- **${timeStr}** ${entry.type}${switchIndicator}\n`;
      output += `  - Node: ${entry.nodeId}\n`;
      
      if (entry.tags.length > 0) {
        const relevantTags = entry.tags.filter(tag => 
          tag.startsWith("proj:") || tag.startsWith("ws:") || tag.startsWith("issue:")
        );
        if (relevantTags.length > 0) {
          output += `  - Tags: ${relevantTags.join(", ")}\n`;
        }
      }
      output += "\n";
    }
  }
  
  return output;
}

/**
 * Format branch activity summary
 */
export function formatBranchActivity(
  activities: BranchActivity[],
  options: TimelineFormatterOptions
): string {
  const { timeWindow } = options;
  
  let output = `# Workstream Dashboard - Branch Activity Summary\n\n`;
  output += `*Time window: ${timeWindow}*\n\n`;
  
  if (activities.length === 0) {
    output += "*No branch activity detected*\n";
    return output;
  }
  
  // Sort by last activity (most recent first)
  const sortedActivities = [...activities].sort((a, b) => a.lastActivity - b.lastActivity);
  
  for (const activity of sortedActivities) {
    const statusEmoji = getStatusEmoji(activity.status);
    const timeStr = formatTimeAgo(activity.lastActivity);
    
    output += `## ${statusEmoji} ${activity.branch}\n\n`;
    output += `- **Status**: ${activity.status}\n`;
    output += `- **Last Activity**: ${timeStr}\n`;
    output += `- **Commits**: ${activity.commits.length}\n\n`;
    
    if (activity.commits.length > 0) {
      output += "Recent commits:\n";
      const recentCommits = activity.commits.slice(0, 5);
      
      for (const commit of recentCommits) {
        const commitTimeStr = formatTimeAgo(commit.timeAgo);
        output += `  - ${commitTimeStr}: ${commit.type} (${commit.id})\n`;
      }
      output += "\n";
    }
  }
  
  return output;
}

/**
 * Calculate metrics from timeline data
 */
function calculateMetrics(timeline: TimelineEntry[]) {
  const contextSwitches = timeline.filter(entry => entry.contextSwitch).length;
  const uniqueBranches = new Set(timeline.map(entry => entry.branch)).size;
  
  // Calculate average focus duration
  let totalFocusTime = 0;
  let focusPeriods = 0;
  let currentBranch = "";
  let branchStartTime = 0;
  
  for (const entry of timeline) {
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
    contextSwitches,
    activeBranches: uniqueBranches,
    focusDuration: avgFocusDuration
  };
}

/**
 * Format metrics section
 */
function formatMetrics(metrics: ReturnType<typeof calculateMetrics>, timeWindow: string): string {
  return `## Metrics\n\n` +
    `- **Context Switches**: ${metrics.contextSwitches}\n` +
    `- **Active Branches**: ${metrics.activeBranches}\n` +
    `- **Avg Focus Duration**: ${formatTimeAgo(metrics.focusDuration)}\n` +
    `- **Time Window**: ${timeWindow}\n`;
}

/**
 * Group timeline entries by branch
 */
function groupByBranch(timeline: TimelineEntry[]): Record<string, TimelineEntry[]> {
  const groups: Record<string, TimelineEntry[]> = {};
  
  for (const entry of timeline) {
    if (!groups[entry.branch]) {
      groups[entry.branch] = [];
    }
    groups[entry.branch].push(entry);
  }
  
  return groups;
}

/**
 * Format time ago in a human-readable format
 */
function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

/**
 * Get status emoji for branch activity
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case "active": return "🟢";
    case "recent": return "🟡";
    case "idle": return "🔴";
    default: return "⚪";
  }
}
