# Smart Context Balancing for Session Warmup

## Overview

The Personal KG MCP now includes intelligent context balancing to prevent high-volume repetitive captures from drowning out important work during session warmup.

## Problem Statement

When doing intensive work that generates many similar captures (e.g., linting fixes, test updates), the session warmup would be flooded with repetitive content, hiding:
- Strategic decisions
- Open questions
- Blockers
- Work from other areas

This made it difficult to maintain context continuity when switching between maintenance work and strategic planning.

## Solution

The smart context balancing system applies multiple intelligence layers:

### 1. **Importance Weighting**

Nodes are weighted based on:
- **Explicit importance level**: `high` (3.0x), `medium` (1.5x), `low` (0.5x)
- **Node type boosts**:
  - `decision`: 2.0x
  - `question`: 1.8x
  - `insight`: 1.5x
  - `progress`: 1.0x
- **Tag-based adjustments**:
  - `blocker` tag: 2.5x boost
  - Maintenance tags (`lint`, `format`, `fix`): 0.6x reduction

### 2. **Temporal Decay**

Recent work is prioritized using exponential decay:
- Last hour: 1.0 weight
- After 24 hours: 0.5 weight
- After 48 hours: 0.25 weight

This ensures the most recent and relevant context surfaces first.

### 3. **Diversity Scoring**

To prevent similar nodes from dominating the warmup:
- Calculates content similarity using embeddings
- Prefers nodes that are diverse from already-selected nodes
- Uses cosine similarity to measure content overlap
- Applies leniency thresholds to ensure target count is met

### 4. **Pattern Detection & Clustering**

Identifies high-volume repetitive work:
- Groups similar nodes into clusters
- Detects when >50% of nodes are highly similar (similarity > 0.75)
- Provides summaries of grouped work instead of listing all instances
- Highlights high-volume patterns in context insights

### 5. **Priority Separation**

Strategic work is explicitly separated:
- Allocates 30% of warmup slots to high-priority nodes (decisions, questions, blockers)
- Ensures strategic work always surfaces even during high-volume maintenance

## API Response Changes

The session warmup response now includes:

```typescript
{
  project: string,
  workstream?: string,
  recentWork: KnowledgeNode[],  // Intelligently selected nodes
  openQuestions: KnowledgeNode[],
  blockers: KnowledgeNode[],

  // NEW: Context insights
  contextInsights: {
    totalCapturedNodes: number,     // Total nodes in project
    displayedNodes: number,          // Nodes shown in recentWork
    clusteredGroups: number,         // Number of grouped clusters
    highVolumePatterns: string[],    // Detected repetitive workstreams
    diversityApplied: boolean        // Whether filtering occurred
  },

  // NEW: Grouped work summaries
  groupedWork?: Array<{
    summary: string,                 // e.g., "15 related items: lint, formatting, style"
    count: number,                   // Number of nodes in cluster
    importance: "high" | "medium" | "low",
    representativeNode?: {           // Sample node from the cluster
      id: string,
      content: string,
      type: string,
      updatedAt: string
    }
  }>,

  sessionStart: string,
  githubState: any,
  workflowReminders: any
}
```

## Implementation Details

### Smart Context Selection Algorithm

1. **Score all nodes**: Combine importance weight × temporal weight
2. **Detect high-volume patterns**: Identify workstreams with repetitive captures
3. **Separate priority nodes**: Extract decisions, questions, blockers (top 30%)
4. **Apply diversity selection**: Choose varied nodes from remaining pool
5. **Fill to target**: Ensure target count is met even if low diversity
6. **Cluster remaining**: Group similar unselected nodes for summaries

### Configuration

The system uses reasonable defaults:
- Target count: 20 nodes (or specified `limit`)
- Candidate pool: 3x target count (minimum 60)
- Similarity threshold for clustering: 0.7
- High-volume pattern detection: >50% similar pairs
- Diversity leniency: 0.1-0.3 depending on selection progress

## Benefits

1. **Better context continuity**: Strategic work always surfaces
2. **Reduced noise**: Repetitive maintenance work is summarized
3. **Improved decision tracking**: Important decisions aren't buried
4. **Cross-workstream visibility**: Diverse work areas remain visible
5. **Automatic adaptation**: No user configuration needed

## Backward Compatibility

- Fully backward compatible with existing session warmup usage
- No breaking changes to API
- Additional fields are optional and additive
- Existing integrations continue to work unchanged

## Example Scenario

**Before smart balancing:**
```
Session warmup with 60 linting captures:
1. Fixed lint error in file A
2. Fixed lint error in file B
3. Fixed lint error in file C
... (57 more similar items)
60. Important architectural decision about API design  ← BURIED!
```

**After smart balancing:**
```
recentWork: [
  - Important architectural decision about API design
  - Question about database migration strategy
  - Blocker: waiting for API key approval
  - Progress on user authentication feature
  - (16 more diverse, important nodes)
]

groupedWork: [
  {
    summary: "57 related items: lint, formatting, style-fixes",
    count: 57,
    importance: "low",
    representativeNode: { ... }
  }
]

contextInsights: {
  highVolumePatterns: ["ws:codebase-cleanup"]
}
```

## Future Enhancements

Potential improvements for future versions:
- User-configurable importance weights
- Learned preferences based on usage patterns
- Integration with issue tracking systems for automatic importance
- Time-of-day awareness (different context during planning vs. execution)
- Project-specific tuning based on historical patterns

## Related Issues

Resolves: #2 - Session warmup context drowning with high-volume agent captures
