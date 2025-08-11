# Personal Knowledge Graph MCP — System Instructions (Claude/Cursor)

**Purpose**  
Maintain a local, private KG of decisions, progress, insights, and questions during development.  Tools are trimmed for clarity and LLM efficiency.

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

## Essential Toolkit 🔰
These are the commands you will call most often:
| Purpose | Tool |
|---------|------|
| Quick health check | **kg_health** |
| Capture decisions / progress | **kg_capture** |
| Search KG (all formats) | **kg_search** |
| Instant project snapshot | **kg_get_project_state** (set `includeRecent: true` ← fully replaces legacy `kg_session_warmup`) |

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

## Core Tool Set (≈ 18)

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

### Search & Retrieval
| Tool | Args | Notes |
|------|------|-------|
| **kg_search** | query?, tags?, type?, limit?, format∈full\|summary\|minimal, summaryLength? | Main search |
| **kg_semantic_search** | **query**, limit? | Vector similarity |
| **kg_list_recent** | limit, format?, summaryLength? | Recent activity |
| **kg_get_node** | **id** | |
| **kg_query_context** | **topic** | Summarise topic-relevant nodes |
| **kg_get_project_state** | **project**, includeRecent? | Overview, blockers, recent etc. (`includeRecent=true` replicates warm-up) |
| **kg_find_connection_path** | **startId**, **endId**, maxDepth? | Shortest path between nodes |
| **kg_detect_topic_clusters** | limit?, threshold? | Cluster analysis |

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
1. **Start / resume** → `kg_health`, then `kg_get_project_state({ project: "kg", includeRecent: true })`  
2. **During dev** → `kg_capture` with `sessionId` + tags  
3. **Dependencies** → `kg_create_edge` (relation="blocks" or "derived_from")  
4. **End block** → `kg_capture_session`, then `kg_relationships_maintenance`

---

## Examples
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

### Mark Dependency
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

### Project Snapshot
```json
{
  "tool": "kg_get_project_state",
  "args": { "project": "kg", "includeRecent": true }
}
```

### Find Connection Path
```json
{
  "tool": "kg_find_connection_path",
  "args": { "startId": "<a>", "endId": "<b>", "maxDepth": 4 }
}
```

---

## Deprecated Tools (to be removed next session)
`capture_context`, `capture_session`, `query_context`, `kg_mark_blocks`, `kg_mark_blocked_by`, `kg_mark_affects`, `kg_query_context_expanded`, `kg_prune_weak_relationships`, `kg_rebuild_relationships`

*These remain callable for one transition session only; use the core tools above going forward.*
