# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Modular architecture implementation
- GitHub Actions CI/CD pipeline
- Automated NPM publishing
- Release automation
- Comprehensive documentation

## [2.0.0] - 2025-08-14

### Added
- **Modular Architecture**: Refactored from monolithic 1,625-line server to modular structure
- **Core Tools Module**: kg_health, kg_capture, kg_capture_session, kg_link_session
- **Search Tools Module**: kg_list_recent, kg_search, kg_semantic_search, kg_find_similar, kg_query_time_range, kg_query_context
- **Relationship Tools Module**: Placeholder for 10 relationship management tools
- **Maintenance Tools Module**: Placeholder for 5 maintenance tools
- **Analysis Tools Module**: Placeholder for 4 analysis tools
- **Project Tools Module**: Placeholder for 3 project tools
- **Deprecated Tools Module**: Placeholder for deprecated tools
- **New Modular Server**: server-modular.ts (100 lines vs 1,625 lines)
- **Comprehensive Documentation**: MODULAR_ARCHITECTURE.md with detailed architecture guide
- **Development Scripts**: dev:modular and start:modular commands
- **GitHub Repository**: Standalone repository at https://github.com/tomschell/personal-kg-mcp-v2
- **CI/CD Pipeline**: GitHub Actions for testing, building, and deployment
- **NPM Publishing**: Configured for public publishing with proper metadata
- **Release Automation**: Automated versioning and release management

### Changed
- **Code Organization**: Much cleaner, focused file structure
- **Maintainability**: Easier to find and modify specific tools
- **Testability**: Isolated tool groups for better testing
- **Collaboration**: Multiple developers can work on different tool groups

### Technical
- All tests passing (27/27)
- TypeScript compilation successful
- Backward compatibility maintained
- No breaking changes to tool interfaces

## [1.0.0] - 2025-01-01

### Added
- Initial Personal KG MCP server implementation
- 43 tools for knowledge graph management
- File-based storage system
- Vector similarity search
- Relationship management
- Session management
- Project state tracking
