# Personal Knowledge Graph MCP Server

Minimal MCP server for local knowledge capture and query, integrated with Cursor via stdio.

## Run

```bash
cd /Users/thomasschell/Coding/Hoistv2/packages/personal-kg-mcp
npm run build
PKG_STORAGE_DIR=/Users/thomasschell/Coding/Hoistv2/data/knowledge/personal npm run start:cjs
```

## Tools
- `kg_health`
- `kg_capture` (alias: `capture_context`): { content, type, tags?, visibility?, includeGit?, importance?, auto_link? }
- `kg_capture_session` (alias: `capture_session`): { summary, duration?, artifacts?, next_actions?, visibility?, importance? }
- `kg_get_node`, `kg_list_recent`, `kg_search`, `kg_semantic_search`, `kg_find_similar`
- `kg_query_context` (alias: `query_context`)
- `kg_export`, `kg_import`, `kg_backup`, `kg_validate`, `kg_repair`
- `kg_query_time_range`, `kg_rebuild_relationships`, `kg_prune_weak_relationships`, `kg_graph_export`

## Examples

```json
{ "tool": "kg_capture", "args": { "content": "Progress: server up.", "type": "progress", "includeGit": true } }
```

```json
{ "tool": "kg_query_context", "args": { "topic": "KG viz dev" } }
```

## Env
- `PKG_STORAGE_DIR`: persistent storage path (default: `.kg`)
- `PKG_AUTO_BACKUP_MINUTES`: if >0, run periodic backups
- `PKG_BACKUP_RETENTION_DAYS`: retention window (default: 30)
- `PKG_USE_ANN`: if `true`, enable ANN-backed semantic search (in-memory facade)


