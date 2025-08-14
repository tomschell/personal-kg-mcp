import type { KnowledgeNode } from "../types/domain.js";
import { 
  extractBranchFromTags, 
  detectContextSwitches, 
  aggregateBranchActivity,
  type BranchActivity,
  type TimelineEntry 
} from "../utils/branchDetection.js";
import { 
  formatTimeline, 
  formatBranchActivity,
  type TimelineFormatterOptions 
} from "../utils/timelineFormatter.js";

export interface WorkstreamDashboardOptions {
  timeWindow: "1h" | "8h" | "24h" | "week";
  showContextSwitches?: boolean;
  showMetrics?: boolean;
  maxEntries?: number;
  outputFormat?: "timeline" | "summary" | "both";
}

export interface WorkstreamDashboardResult {
  timeline: TimelineEntry[];
  branchActivity: BranchActivity[];
  formattedOutput: string;
  metrics: {
    contextSwitches: number;
    activeBranches: number;
    focusDuration: number;
    totalNodes: number;
  };
}

/**
 * Main workstream dashboard service
 */
export class WorkstreamDashboardService {
  private nodes: KnowledgeNode[] = [];
  
  constructor(nodes: KnowledgeNode[]) {
    this.nodes = nodes;
  }
  
  /**
   * Generate workstream dashboard analysis
   */
  async generateDashboard(options: WorkstreamDashboardOptions): Promise<WorkstreamDashboardResult> {
    const {
      timeWindow,
      showContextSwitches = true,
      showMetrics = true,
      maxEntries = 50,
      outputFormat = "both"
    } = options;
    
    // Filter nodes by time window
    const filteredNodes = this.filterNodesByTimeWindow(this.nodes, timeWindow);
    
    // Extract branch information and detect context switches
    const timeline = this.buildTimeline(filteredNodes, showContextSwitches);
    
    // Aggregate branch activity
    const branchActivity = aggregateBranchActivity(timeline);
    
    // Calculate metrics
    const metrics = this.calculateMetrics(timeline, filteredNodes.length);
    
    // Format output based on requested format
    const formattedOutput = this.formatOutput(
      timeline,
      branchActivity,
      {
        timeWindow,
        showContextSwitches,
        showMetrics,
        maxEntries
      },
      outputFormat
    );
    
    return {
      timeline,
      branchActivity,
      formattedOutput,
      metrics
    };
  }
  
  /**
   * Filter nodes by time window
   */
  private filterNodesByTimeWindow(nodes: KnowledgeNode[], timeWindow: string): KnowledgeNode[] {
    const now = Date.now();
    const windowMs = this.getTimeWindowMs(timeWindow);
    const cutoffTime = now - windowMs;
    
    return nodes.filter(node => {
      const nodeTime = new Date(node.createdAt).getTime();
      return nodeTime >= cutoffTime;
    });
  }
  
  /**
   * Get time window in milliseconds
   */
  private getTimeWindowMs(timeWindow: string): number {
    switch (timeWindow) {
      case "1h": return 60 * 60 * 1000;
      case "8h": return 8 * 60 * 60 * 1000;
      case "24h": return 24 * 60 * 60 * 1000;
      case "week": return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000; // Default to 24h
    }
  }
  
  /**
   * Build timeline from filtered nodes
   */
  private buildTimeline(nodes: KnowledgeNode[], detectSwitches: boolean): TimelineEntry[] {
    // Sort nodes by creation time (newest first)
    const sortedNodes = [...nodes].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    const timeline: TimelineEntry[] = [];
    let previousBranch = "";
    
    for (const node of sortedNodes) {
      const branch = extractBranchFromTags(node.tags || []);
      const timeAgo = this.calculateTimeAgo(node.createdAt);
      
      // Detect context switch
      const contextSwitch = detectSwitches && 
        previousBranch !== "" && 
        branch !== previousBranch && 
        branch !== "";
      
      timeline.push({
        branch: branch || "main", // Default to main instead of unknown
        type: node.type || "unknown",
        timeAgo,
        contextSwitch,
        nodeId: node.id,
        tags: node.tags || []
      });
      
      if (branch) {
        previousBranch = branch;
      }
    }
    
    return timeline;
  }
  
  /**
   * Calculate time ago in minutes
   */
  private calculateTimeAgo(createdAt: string): number {
    const now = Date.now();
    const created = new Date(createdAt).getTime();
    return Math.round((now - created) / (1000 * 60)); // Convert to minutes
  }
  
  /**
   * Calculate comprehensive metrics
   */
  private calculateMetrics(timeline: TimelineEntry[], totalNodes: number) {
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
      focusDuration: avgFocusDuration,
      totalNodes
    };
  }
  
  /**
   * Format output based on requested format
   */
  private formatOutput(
    timeline: TimelineEntry[],
    branchActivity: BranchActivity[],
    options: TimelineFormatterOptions,
    format: string
  ): string {
    switch (format) {
      case "timeline":
        return formatTimeline(timeline, options);
      case "summary":
        return formatBranchActivity(branchActivity, options);
      case "both":
      default:
        const timelineOutput = formatTimeline(timeline, options);
        const summaryOutput = formatBranchActivity(branchActivity, options);
        return `${timelineOutput}\n\n---\n\n${summaryOutput}`;
    }
  }
}
