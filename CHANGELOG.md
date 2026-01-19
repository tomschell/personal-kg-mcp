# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2025-01-19

### Performance
- **98% reduction in token usage** for MCP tool responses
  - Stripped embedding arrays (1536 floats) from all node responses
  - Added `formatNodesCompact()` for warmup/listing responses
  - `kg_session_warmup` reduced from 227k chars to ~5k chars

### Added
- New `compact` parameter for `kg_session_warmup`
  - Set `compact: true` to skip `agentTrainingReminders` and `groupedWork` sections
  - Further reduces token usage for constrained contexts

### Changed
- Node responses now use compact format by default:
  - Content truncated to 200 characters
  - `visibility` field removed (almost always "private")
  - `createdAt` field removed (redundant with `updatedAt`)
  - `proj:` tags filtered out (caller already knows the project)
- `kg_search` time_range mode now uses summary format with 300-char content

### Fixed
- Tool responses no longer include massive embedding arrays that caused token limit failures

## [1.1.0] - 2025-01-19

### Added
- OpenAI embeddings integration for semantic search
- `kg_admin migrate_embeddings` operation to backfill OpenAI embeddings
- Hybrid search mode combining semantic + tag matching

### Changed
- Semantic search now uses OpenAI text-embedding-3-small (1536 dimensions)
- Improved search relevance with hybrid scoring

## [1.0.2] - 2025-01-15

### Added
- `latestChanges` field in session warmup for recent work visibility
- Smart context selection to prevent drowning from high-volume captures
- GitHub state integration (configurable)

## [1.0.0] - 2025-01-12

### Added
- Initial release
- Core knowledge capture tools (`kg_capture`, `kg_update_node`)
- Session management (`kg_session_warmup`, `kg_capture_session`)
- Search tools (text, semantic, time_range)
- Relationship management (`kg_edges`)
- Analysis tools (clusters, emerging concepts, path finding)
- Admin/maintenance tools (backup, validate, repair, export/import)
- Question tracking (`kg_open_questions`, `kg_resolve_question`)
