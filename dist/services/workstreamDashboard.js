import { extractBranchFromTags, aggregateBranchActivity } from "../utils/branchDetection.js";
import { formatTimeline, formatBranchActivity } from "../utils/timelineFormatter.js";
/**
 * Main workstream dashboard service
 */
export class WorkstreamDashboardService {
    nodes = [];
    constructor(nodes) {
        this.nodes = nodes;
    }
    /**
     * Generate workstream dashboard analysis
     */
    async generateDashboard(options) {
        const { timeWindow, showContextSwitches = true, showMetrics = true, maxEntries = 50, outputFormat = "both" } = options;
        // Filter nodes by time window
        const filteredNodes = this.filterNodesByTimeWindow(this.nodes, timeWindow);
        // Extract branch information and detect context switches
        const timeline = this.buildTimeline(filteredNodes, showContextSwitches);
        // Aggregate branch activity
        const branchActivity = aggregateBranchActivity(timeline);
        // Calculate metrics
        const metrics = this.calculateMetrics(timeline, filteredNodes.length);
        // Format output based on requested format
        const formattedOutput = this.formatOutput(timeline, branchActivity, {
            timeWindow,
            showContextSwitches,
            showMetrics,
            maxEntries
        }, outputFormat);
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
    filterNodesByTimeWindow(nodes, timeWindow) {
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
    getTimeWindowMs(timeWindow) {
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
    buildTimeline(nodes, detectSwitches) {
        // Sort nodes by creation time (newest first)
        const sortedNodes = [...nodes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const timeline = [];
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
    calculateTimeAgo(createdAt) {
        const now = Date.now();
        const created = new Date(createdAt).getTime();
        return Math.round((now - created) / (1000 * 60)); // Convert to minutes
    }
    /**
     * Calculate comprehensive metrics
     */
    calculateMetrics(timeline, totalNodes) {
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
    formatOutput(timeline, branchActivity, options, format) {
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
