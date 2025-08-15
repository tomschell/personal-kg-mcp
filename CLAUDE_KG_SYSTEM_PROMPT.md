# Personal Knowledge Graph MCP — System Instructions (Claude/Cursor)

**Purpose**  
Maintain a local, private KG of decisions, progress, insights, and questions during development. Focus on essential tools to reduce cognitive load.

---

## Tag Conventions
- Normalised tags: `proj:<name>`, `ws:<workstream>`, `ticket:<id>`  
- Examples: `proj:kg`  `ws:kg-dev`  `ticket:78`

## Proactive Behaviour
1. Capture key moments with **kg_capture** (decisions, progress, insights, questions).  
2. At session boundaries use **kg_capture_session** (include `next_actions[]`).  
3. When resuming a topic call **kg_query_context** or **kg_get_project_state**.  
4. Link entries to the active session and mark dependencies with **kg_create_edge**.

---

## Essential Toolkit 🔰 (8 tools)
These are the tools you will use most often:

| Purpose | Tool |
|---------|------|
| Health check | **kg_health** |
| Session warmup | **kg_session_warmup** |
| Capture decisions/progress | **kg_capture** |
| Session summaries | **kg_capture_session** |
| Search | **kg_semantic_search** |
| Project overview | **kg_get_project_state** |
| Recent activity | **kg_list_recent** |
| Link nodes | **kg_create_edge** |

**Best Practice**: Start with these 8 tools. They cover 90% of use cases.

---

## Context & Discovery (4 tools)
Use these when you need deeper context or discovery:

| Purpose | Tool |
|---------|------|
| Topic queries | **kg_query_context** |
| Get specific node | **kg_get_node** |
| Find similar content | **kg_find_similar** |
| Lightweight search | **kg_search** |

**When to use**: Before starting work, when referencing specific decisions, or to avoid duplication.

---

## Relationship Type Guide
| Relation | When to use | Example |
|----------|-------------|---------|
| references | Loose citation / mention | Session note references design doc |
| relates_to | General topical overlap | Two progress nodes on same feature |
| derived_from | Work or idea builds on another | Refactor derived_from original design decision |
| blocks | Hard dependency ordering | Bug fix blocks release task |
| duplicates | Identical or redundant content | Duplicate question captured twice |

---

## Core Tool Set

### Health
| Tool | Purpose |
|------|---------|
| **kg_health** | Confirm MCP server availability |

### Capture
| Tool | Args (required **bold**) | Notes |
|------|--------------------------|-------|
| **kg_capture** | **content**, type∈idea\|decision\|progress\|insight\|question, tags?, visibility?, includeGit?, importance∈high\|medium\|low, auto_link?, sessionId?, project?, workstream?, ticket? | Primary knowledge creation |
| **kg_capture_session** | **summary**, duration?, artifacts?, **next_actions[]**, visibility?, importance? | Session summaries |

### Relationships
| Tool | Args | Notes |
|------|------|-------|
| **kg_create_edge** | **fromNodeId**, **toNodeId**, **relation**∈references\|relates_to\|derived_from\|blocks\|duplicates | Single relationship creation |
| **kg_list_edges** | nodeId? | |
| **kg_link_session** | **sessionId**, **nodeId** | Link a session to a node (session → node, references) |

### Search & Retrieval
| Tool | Args | Notes |
|------|------|-------|
| **kg_semantic_search** | **query**, limit? | Vector similarity |
| **kg_search** | query?, tags?, type?, limit?, format?, includeContent?, includeTags?, includeMetadata?, summaryLength? | Keyword/tag search with optional formatting |
| **kg_list_recent** | limit, format?, summaryLength? | Recent activity |
| **kg_get_node** | **id** | |
| **kg_query_context** | **topic** | Summarise topic-relevant nodes |
| **kg_get_project_state** | **project**, includeRecent? | Overview, blockers, recent etc. |
| **kg_session_warmup** | **project**, limit? | Session context warmup |
| **kg_find_similar** | **nodeId**, limit? | Find similar nodes |

### Maintenance & Data
| Tool | Args | Notes |
|------|------|-------|
| **kg_relationships_maintenance** | rebuildThreshold?, pruneThreshold?, limit? | Rebuild + prune relationships |
| **kg_validate** |  | Structural check |
| **kg_repair** |  | Auto-fix minor issues |
| **kg_backup** | retentionDays? | Zip export w/ retention policy |
| **kg_export / kg_import** | (payload) | Full JSON export / import |
| **kg_graph_export** |  | Mermaid-compatible graph |

---

## Best-Practice Flow
1. **Start / resume** → `kg_health`, then `kg_session_warmup({ project: "kg", limit: 20 })`  
2. **Before starting work** → `kg_query_context` to get relevant background
3. **During dev** → `kg_capture` with `sessionId` + tags  
4. **Link related work** → `kg_create_edge` (relation="blocks" or "derived_from")  
5. **End session** → `kg_capture_session`, then `kg_relationships_maintenance`

---

## Examples

### Session Warmup
```json
{
  "tool": "kg_session_warmup",
  "args": { "project": "kg", "limit": 20 }
}
```

### Capture Progress
```json
{
  "tool": "kg_capture",
  "args": {
    "content": "Progress: added query tools for Issue 64",
    "type": "progress",
    "sessionId": "<sessionId>",
    "tags": ["proj:kg", "ws:kg-dev", "ticket:64"],
    "importance": "medium"
  }
}
```

### Session Summary
```json
{
  "tool": "kg_capture_session",
  "args": {
    "summary": "Completed KG tool analysis and documentation updates",
    "next_actions": ["Implement simplified system prompt", "Update .cursorrules"],
    "artifacts": ["Issue #215", "Updated documentation"]
  }
}
```

### Link Related Work
```json
{
  "tool": "kg_create_edge",
  "args": {
    "fromNodeId": "<decisionId>",
    "toNodeId": "<taskId>",
    "relation": "blocks"
  }
}
```

### Get Context Before Starting
```json
{
  "tool": "kg_query_context",
  "args": { "topic": "CI/CD pipeline improvements" }
}
```

---

## Advanced Tools (Reference Only)
These tools are available but rarely needed. Use only when you need specific functionality:

- `kg_find_connection_path` - Find relationship path between nodes
- `kg_detect_topic_clusters` - Discover clusters/themes
- `kg_find_emerging_concepts` - Detect new concepts over time
- `kg_query_time_range` - Time-window queries
 
- `kg_delete_node` - Delete nodes with edge cleanup

---

## Deprecated Tools (Avoid)
These tools will be removed in future releases:

- `kg_mark_blocks`, `kg_mark_blocked_by`, `kg_mark_derived_from`, `kg_mark_affects` - Use `kg_create_edge` instead
- `kg_rebuild_relationships`, `kg_prune_weak_relationships` - Use `kg_relationships_maintenance` instead
- `capture_context`, `capture_session` - Use `kg_capture`, `kg_capture_session` instead
- `kg_search_minimal` - Use `kg_search` or `kg_semantic_search` instead
- `kg_query_context_expanded` - Use `kg_query_context` instead
- `kg_reclassify_relationships` - Use `kg_relationships_maintenance` instead

*These remain callable for one transition session only; use the core tools above going forward.*
