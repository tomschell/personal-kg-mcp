# Personal KG MCP - Modular Architecture

This document describes the new modular architecture for the Personal KG MCP server.

## Overview

The Personal KG MCP server has been refactored from a monolithic 1,625-line `server.ts` file into a modular structure with focused tool groups. This improves maintainability, testability, and code organization.

## Architecture

### Directory Structure

```
src/
├── server.ts                    # Original monolithic server (1,625 lines)
├── server-modular.ts            # New modular server (100 lines)
└── tools/                       # Modular tool groups
    ├── index.ts                 # Export all tool setup functions
    ├── core.ts                  # Core tools (kg_health, kg_capture, kg_capture_session)
    ├── search.ts                # Search-related tools (12 tools)
    ├── relationships.ts         # Relationship management tools (10 tools)
    ├── maintenance.ts           # Backup, validate, repair, export/import (5 tools)
    ├── analysis.ts              # Clustering, emerging concepts, etc. (4 tools)
    ├── project.ts               # Project state, session warmup, dashboard (3 tools)
    └── deprecated.ts            # All deprecated tools (6 tools)
```

### Tool Groups

#### Core Tools (`core.ts`)
- `kg_health` - System health status and diagnostics
- `kg_capture` - Primary knowledge capture tool
- `kg_capture_session` - Session summary capture
- `kg_link_session` - Link nodes to sessions
- `capture_context` - Deprecated alias for kg_capture
- `capture_session` - Deprecated alias for kg_capture_session

#### Search Tools (`search.ts`)
- `kg_list_recent` - List recent nodes with formatting options
- `kg_search` - Search nodes with ranking
- `kg_semantic_search` - AI-powered semantic search
- `kg_find_similar` - Find similar nodes
- `kg_query_time_range` - Search within time ranges
- `kg_query_context` - Reconstruct context around topics
- `kg_list_recent_summary` - Deprecated convenience alias
- `kg_list_recent_minimal` - Deprecated convenience alias
- `kg_search_summary` - Deprecated convenience alias
- `kg_search_minimal` - Deprecated convenience alias
- `kg_query_context_expanded` - Deprecated expanded query
- `query_context` - Deprecated alias for kg_query_context

#### Relationship Tools (`relationships.ts`)
- `kg_create_edge` - Create explicit relationships
- `kg_mark_blocks` - Mark blocking relationships (deprecated wrapper)
- `kg_mark_blocked_by` - Mark blocked-by relationships (deprecated wrapper)
- `kg_mark_derived_from` - Mark derived-from relationships
- `kg_mark_affects` - Mark affecting relationships (deprecated wrapper)
- `kg_list_edges` - List relationships
- `kg_rebuild_relationships` - Rebuild relationship scores (deprecated)
- `kg_relationships_maintenance` - Relationship maintenance
- `kg_prune_weak_relationships` - Prune weak relationships (deprecated)
- `kg_reclassify_relationships` - Reclassify relationships (deprecated)

#### Maintenance Tools (`maintenance.ts`)
- `kg_backup` - Create backups
- `kg_validate` - Validate data integrity
- `kg_repair` - Repair data issues
- `kg_export` - Export data
- `kg_import` - Import data

#### Analysis Tools (`analysis.ts`)
- `kg_detect_topic_clusters` - Detect topic clusters
- `kg_find_emerging_concepts` - Find emerging concepts
- `kg_graph_export` - Export graph data
- `kg_export` - General export (duplicate for backward compatibility)

#### Project Tools (`project.ts`)
- `kg_get_project_state` - Get project state
- `kg_session_warmup` - Session warmup
- `kg_workstream_dashboard` - Workstream dashboard

#### Deprecated Tools (`deprecated.ts`)
- `capture_context` - Deprecated alias for kg_capture
- `capture_session` - Deprecated alias for kg_capture_session
- `query_context` - Deprecated alias for kg_query_context
- `kg_query_context_expanded` - Deprecated expanded query
- `kg_delete_node` - Delete knowledge nodes
- `kg_get_node` - Get specific knowledge nodes

## Usage

### Development

```bash
# Use original monolithic server
npm run dev

# Use new modular server
npm run dev:modular
```

### Production

```bash
# Build both servers
npm run build

# Start original server
npm start

# Start modular server
npm run start:modular
```

## Benefits

### Maintainability
- **Focused files**: Each tool group has a clear, focused purpose
- **Easier navigation**: Find specific tools quickly
- **Reduced complexity**: Smaller, more manageable files

### Testability
- **Isolated testing**: Test individual tool groups in isolation
- **Better coverage**: Easier to achieve comprehensive test coverage
- **Mocking**: Simpler to mock dependencies for specific tool groups

### Collaboration
- **Parallel development**: Multiple developers can work on different tool groups
- **Reduced conflicts**: Less chance of merge conflicts
- **Clear ownership**: Clear responsibility for each tool group

### Reusability
- **Conditional inclusion**: Tool groups can be conditionally included
- **Modular deployment**: Deploy only needed tool groups
- **Plugin architecture**: Foundation for future plugin system

## Migration

The modular architecture is designed to be a drop-in replacement for the monolithic server. All existing functionality is preserved, and the API remains unchanged.

### Backward Compatibility
- All existing tools work exactly as before
- No breaking changes to tool interfaces
- Deprecated tools continue to work with warnings

### Gradual Migration
- Both servers can coexist during transition
- Easy rollback if issues are discovered
- Incremental tool group migration possible

## Implementation Status

### ✅ Phase 1: Modular Structure Setup (COMPLETED)
- Created modular directory structure
- Implemented core and search tools
- Created modular server with backward compatibility
- All tests passing (27/27)

### ✅ Phase 2: Tool Migration (COMPLETED)
- **Relationship Tools**: All 10 relationship management tools migrated
- **Maintenance Tools**: All 5 maintenance tools migrated
- **Analysis Tools**: All 4 analysis tools migrated
- **Project Tools**: All 3 project tools migrated
- **Deprecated Tools**: All 6 deprecated tools migrated
- **Full Backward Compatibility**: All existing functionality preserved
- **Comprehensive Testing**: All tests passing (27/27)

### 🔄 Phase 3: Tool Consolidation (NEXT)
- Consolidate 41 tools down to 25 essential tools
- Remove deprecated tools
- Optimize tool interfaces

### 🔄 Phase 4: Plugin System (FUTURE)
- Enable dynamic tool loading
- Support for custom tool groups
- Plugin marketplace

## Contributing

When adding new tools:

1. **Identify the appropriate tool group** based on functionality
2. **Add the tool to the correct module** file
3. **Update the module's setup function** to register the tool
4. **Add tests** for the new tool
5. **Update documentation** in this file

## Testing

```bash
# Run all tests
npm test

# Run tests with verbose output
npm run test:unit

# Test specific tool groups
npm test -- --grep "core"
npm test -- --grep "search"
```

## Tool Migration Summary

### Phase 2 Achievements
- **Total Tools Migrated**: 28 tools across 5 modules
- **Relationship Tools**: 10 tools (kg_create_edge, kg_mark_blocks, etc.)
- **Maintenance Tools**: 5 tools (kg_backup, kg_validate, kg_repair, kg_export, kg_import)
- **Analysis Tools**: 4 tools (kg_detect_topic_clusters, kg_find_emerging_concepts, kg_graph_export, kg_export)
- **Project Tools**: 3 tools (kg_get_project_state, kg_session_warmup, kg_workstream_dashboard)
- **Deprecated Tools**: 6 tools (capture_context, capture_session, query_context, etc.)

### Quality Assurance
- **Build Success**: TypeScript compilation successful
- **Test Coverage**: All 27 tests passing
- **Backward Compatibility**: Full API compatibility maintained
- **Error Handling**: Proper error handling and logging implemented
- **Documentation**: All tools properly documented with descriptions

### Next Steps
- **Phase 3**: Begin tool consolidation to reduce from 41 to 25 tools
- **Performance Optimization**: Optimize tool interfaces and reduce duplication
- **Plugin Architecture**: Foundation for future extensibility
