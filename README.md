# Personal Knowledge Graph MCP Server

Minimal scaffold for the Personal Knowledge Graph MCP server. Implements a health tool and a placeholder capture tool. Follow-up work will implement full spec (storage, query, relationships, git integration).

## Scripts
- `dev`: Run via stdio for local testing
- `build`: TypeScript build
- `test`: Vitest

## Tools
- `kg_health`: returns server status
- `kg_capture`: { content, type, tags?, includeGit? } → persists node
- `kg_get_node`: { id } → retrieves a node
- `kg_list_recent`: { limit? } → lists recent nodes
- `kg_create_edge`: { fromNodeId, toNodeId, relation }
- `kg_list_edges`: { nodeId? }
- `kg_search`: { query?, tags?, type?, limit? }
- `kg_delete_node`: { id, deleteEdges? }
- `kg_export` / `kg_import`: backup/restore
- `kg_capture_session`: { summary, duration?, artifacts?, next_actions?, visibility?, importance? }
- `kg_semantic_search`: { query, limit? }
- `kg_find_similar`: { nodeId, limit? }
 - `kg_backup`: { retentionDays? } → snapshot nodes/edges with retention cleanup
 - `kg_validate`: {} → validate on-disk data
 - `kg_repair`: {} → quarantine and remove invalid files

Planned:
- `kg_backup`: create dated backup with retention
- `kg_validate`: validate on-disk data and report issues


