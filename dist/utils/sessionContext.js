// Session Context Intelligence
// Provides smart context balancing for session warmup to prevent high-volume
// captures from drowning out important work
import { embedText, cosineSimilarity } from "./embeddings.js";
import { clusterBySimilarity } from "./clustering.js";
/**
 * Detects if a set of nodes represents high-volume repetitive work
 * Returns true if >50% of nodes are very similar to each other
 */
function isHighVolumePattern(nodes, similarityThreshold = 0.75) {
    if (nodes.length < 3)
        return false;
    const vectors = nodes.map(n => embedText(n.content));
    let similarPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < vectors.length; i++) {
        for (let j = i + 1; j < vectors.length; j++) {
            const similarity = cosineSimilarity(vectors[i], vectors[j]);
            if (similarity >= similarityThreshold) {
                similarPairs++;
            }
            totalPairs++;
        }
    }
    return totalPairs > 0 && (similarPairs / totalPairs) > 0.5;
}
/**
 * Calculates diversity score for a node relative to already selected nodes
 * Higher score = more diverse from existing selection
 */
function calculateDiversityScore(node, selectedNodes) {
    if (selectedNodes.length === 0)
        return 1.0;
    const nodeVec = embedText(node.content);
    const similarities = selectedNodes.map(selected => cosineSimilarity(nodeVec, embedText(selected.content)));
    // Return inverse of max similarity (most diverse = least similar to anything selected)
    const maxSimilarity = Math.max(...similarities);
    return 1.0 - maxSimilarity;
}
/**
 * Assigns importance weight to a node based on its type and tags
 */
function getImportanceWeight(node) {
    // Base weight from explicit importance
    let weight = 1.0;
    if (node.importance === "high")
        weight = 3.0;
    else if (node.importance === "medium")
        weight = 1.5;
    else if (node.importance === "low")
        weight = 0.5;
    // Boost strategic node types
    if (node.type === "decision")
        weight *= 2.0;
    else if (node.type === "question")
        weight *= 1.8;
    else if (node.type === "insight")
        weight *= 1.5;
    else if (node.type === "progress")
        weight *= 1.0;
    // Boost blockers
    if (node.tags.includes("blocker"))
        weight *= 2.5;
    // Reduce weight for maintenance tags
    if (node.tags.some(t => t.includes("lint") || t.includes("format") || t.includes("fix"))) {
        weight *= 0.6;
    }
    return weight;
}
/**
 * Groups similar nodes and returns a representative node for each cluster
 */
function groupSimilarNodes(nodes, similarityThreshold = 0.7) {
    if (nodes.length === 0)
        return [];
    // Use existing clustering utility
    const clusters = clusterBySimilarity(nodes, similarityThreshold);
    const groups = [];
    for (const cluster of clusters) {
        const clusterNodes = nodes.filter(n => cluster.nodes.includes(n.id));
        if (clusterNodes.length === 0)
            continue;
        // Find representative node (center node from cluster)
        const representative = clusterNodes.find(n => n.id === cluster.centerNode) || clusterNodes[0];
        // Determine group importance (highest importance in cluster)
        let groupImportance = "low";
        for (const node of clusterNodes) {
            if (node.importance === "high") {
                groupImportance = "high";
                break;
            }
            else if (node.importance === "medium" && groupImportance === "low") {
                groupImportance = "medium";
            }
        }
        // Generate summary for clusters with multiple nodes
        let summary;
        if (clusterNodes.length > 1) {
            const keywords = cluster.keywords.join(", ");
            summary = `${clusterNodes.length} related items: ${keywords}`;
        }
        groups.push({
            type: clusterNodes.length > 1 ? "cluster" : "individual",
            nodes: clusterNodes,
            summary,
            importance: groupImportance,
            representativeNode: representative
        });
    }
    return groups;
}
/**
 * Applies temporal decay to give more weight to recent work
 */
function getTemporalWeight(node, now) {
    const nodeDate = new Date(node.updatedAt);
    const hoursSince = (now.getTime() - nodeDate.getTime()) / (1000 * 60 * 60);
    // Exponential decay: nodes from last hour = 1.0, after 24h = 0.5, after 48h = 0.25
    return Math.exp(-hoursSince / 24);
}
/**
 * Main function: Intelligently selects diverse, important nodes for session warmup
 * Returns priority nodes and grouped clusters
 */
export function selectSmartContext(allNodes, targetCount = 20) {
    if (allNodes.length === 0) {
        return {
            priorityNodes: [],
            clusters: [],
            summary: {
                totalNodes: 0,
                uniqueWorkStreams: 0,
                highVolumePatterns: []
            }
        };
    }
    const now = new Date();
    const scoredNodes = allNodes.map(node => {
        const importanceScore = getImportanceWeight(node);
        const temporalScore = getTemporalWeight(node, now);
        return {
            node,
            importanceScore,
            temporalScore,
            totalScore: importanceScore * temporalScore
        };
    });
    // Step 2: Detect high-volume patterns
    const workstreams = new Map();
    for (const node of allNodes) {
        const wsTag = node.tags.find(t => t.startsWith('ws:'));
        const key = wsTag || 'general';
        if (!workstreams.has(key))
            workstreams.set(key, []);
        workstreams.get(key).push(node);
    }
    const highVolumePatterns = [];
    for (const [ws, nodes] of workstreams.entries()) {
        if (isHighVolumePattern(nodes)) {
            highVolumePatterns.push(ws);
        }
    }
    // Step 3: Separate high-priority nodes (decisions, blockers, questions) from regular progress
    const highPriorityTypes = new Set(['decision', 'question', 'insight']);
    const highPriorityNodes = scoredNodes
        .filter(sn => highPriorityTypes.has(sn.node.type) ||
        sn.node.tags.includes('blocker') ||
        sn.node.importance === 'high')
        .sort((a, b) => b.totalScore - a.totalScore);
    const regularNodes = scoredNodes
        .filter(sn => !highPriorityTypes.has(sn.node.type) &&
        !sn.node.tags.includes('blocker') &&
        sn.node.importance !== 'high')
        .sort((a, b) => b.totalScore - a.totalScore);
    // Step 4: Select diverse priority nodes
    const selectedNodes = [];
    // Always include top high-priority nodes (up to 30% of target)
    const highPriorityQuota = Math.max(3, Math.floor(targetCount * 0.3));
    for (let i = 0; i < Math.min(highPriorityQuota, highPriorityNodes.length); i++) {
        selectedNodes.push(highPriorityNodes[i].node);
    }
    // Fill remaining slots with diverse selection from regular nodes
    const remainingQuota = targetCount - selectedNodes.length;
    // First pass: Try to select diverse nodes
    const candidatesWithDiversity = [];
    for (const scoredNode of regularNodes) {
        const diversityScore = calculateDiversityScore(scoredNode.node, selectedNodes);
        const combinedScore = scoredNode.totalScore * (0.7 + 0.3 * diversityScore);
        candidatesWithDiversity.push({
            node: scoredNode.node,
            score: combinedScore,
            diversity: diversityScore
        });
    }
    // Sort by combined score (importance + diversity)
    candidatesWithDiversity.sort((a, b) => b.score - a.score);
    // Select nodes, preferring diverse ones but ensuring we meet the target count
    for (let i = 0; i < candidatesWithDiversity.length && selectedNodes.length < targetCount; i++) {
        const candidate = candidatesWithDiversity[i];
        // Be more lenient if we're not close to the target yet
        const leniencyThreshold = selectedNodes.length < targetCount * 0.5 ? 0.1 : 0.3;
        if (candidate.diversity > leniencyThreshold || i < remainingQuota) {
            selectedNodes.push(candidate.node);
        }
    }
    // If we still haven't met the target, add more nodes regardless of diversity
    // This ensures we always return up to the target count when nodes are available
    if (selectedNodes.length < targetCount && allNodes.length > selectedNodes.length) {
        const remaining = allNodes.filter(n => !selectedNodes.includes(n));
        remaining.sort((a, b) => {
            const aTime = new Date(a.updatedAt).getTime();
            const bTime = new Date(b.updatedAt).getTime();
            return bTime - aTime; // Most recent first
        });
        for (const node of remaining) {
            if (selectedNodes.length >= targetCount)
                break;
            selectedNodes.push(node);
        }
    }
    // Step 5: Group remaining nodes into clusters
    const remainingNodes = allNodes.filter(n => !selectedNodes.includes(n));
    const clusters = groupSimilarNodes(remainingNodes, 0.7);
    return {
        priorityNodes: selectedNodes,
        clusters: clusters.filter(c => c.nodes.length > 0),
        summary: {
            totalNodes: allNodes.length,
            uniqueWorkStreams: workstreams.size,
            highVolumePatterns
        }
    };
}
