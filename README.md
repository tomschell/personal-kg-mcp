# Personal Knowledge Graph MCP v2.0

A Model Context Protocol (MCP) server that provides a comprehensive personal knowledge graph system. Capture, search, and analyze your knowledge with AI-powered tools for building interconnected understanding.

## 🎯 Features

- **Knowledge Capture**: Record decisions, progress, insights, questions, and ideas
- **Semantic Search**: AI-powered search using vector embeddings  
- **Relationship Management**: Automatic and manual relationship detection
- **Session Tracking**: Organize work into sessions with summaries and next actions
- **Project State**: Get comprehensive project overviews and status
- **Workstream Dashboard**: Analyze activity patterns and context switching
- **Self-Documenting**: All 41 tools include comprehensive inline documentation

## 🚀 Quick Start

### Installation

```bash
npm install
npm run build
```

### Usage

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### Configuration

Set environment variables in `.env`:

```env
PKG_STORAGE_DIR=.kg                    # Storage directory (default: .kg)
PKG_USE_ANN=false                      # Use ANN index for search (default: false)
PKG_AUTO_BACKUP_MINUTES=0              # Auto-backup interval (default: disabled)
PKG_BACKUP_RETENTION_DAYS=30           # Backup retention (default: 30 days)
```

## 📚 Core Tools

### Essential Toolkit (8 tools)
- `kg_health` - System health and diagnostics
- `kg_capture` - Primary knowledge capture tool
- `kg_session_warmup` - Load project context for new sessions
- `kg_semantic_search` - AI-powered semantic search
- `kg_create_edge` - Create relationships between nodes
- `kg_capture_session` - End-of-session summaries
- `kg_get_project_state` - Comprehensive project overview
- `kg_search` - Hybrid search with ranking

### Context & Discovery (12 tools)
- `kg_list_recent` - Browse recent activity
- `kg_get_node` - Retrieve specific nodes
- `kg_query_context` - Reconstruct topic context
- `kg_query_time_range` - Search by time period
- `kg_query_code` - Find code-related knowledge
- `kg_find_connection_path` - Discover node relationships
- `kg_find_similar` - Find semantically similar nodes
- And 5 more specialized search tools

### Advanced Tools (21 tools)
- Relationship management and maintenance
- Data export/import and backup
- Topic clustering and emerging concept detection
- Workstream dashboard and analytics
- Graph validation and repair

## 🏗️ Architecture

### Modular Design
- **Core**: Health, capture, and basic operations
- **Search**: Multiple search strategies and semantic analysis
- **Relationships**: Automatic and manual relationship management
- **Sessions**: Work session organization and tracking
- **Analytics**: Advanced analysis and visualization
- **Maintenance**: Backup, validation, and repair

### Storage
- File-based storage with JSON documents
- Automatic backup and retention management
- Data integrity validation and repair
- Export/import for migration and sharing

### AI Features
- Vector embeddings for semantic search
- Automatic relationship detection
- Content similarity analysis
- Topic clustering and trend detection

## 🔧 Development

### Build System
```bash
npm run build      # TypeScript compilation
npm run test       # Run test suite
npm run dev        # Development mode with hot reload
```

### Testing
```bash
npm test           # Run all tests
npm run test:unit  # Verbose test output
```

### Code Structure
```
src/
├── server.ts              # Main MCP server
├── handlers/              # Request handlers
├── services/              # Business logic services
├── storage/               # Data persistence layer
├── types/                 # TypeScript definitions
└── utils/                 # Utility functions
```

## 📖 Usage Examples

### Basic Knowledge Capture
```javascript
// Capture a decision
kg_capture({
  content: "Decided to use TypeScript for better type safety",
  type: "decision",
  tags: ["typescript", "architecture"],
  project: "personal-kg-v2"
})

// Capture progress
kg_capture({
  content: "Completed Phase 0 repository extraction",
  type: "progress", 
  importance: "high",
  project: "personal-kg-v2"
})
```

### Session Management
```javascript
// Start session with context
kg_session_warmup({
  project: "personal-kg-v2",
  includeDashboard: true,
  showAttentionAlerts: true
})

// End session with summary
kg_capture_session({
  summary: "Completed Phase 0 validation and documentation",
  artifacts: ["README.md", "LICENSE", ".gitignore"],
  next_actions: ["Begin Phase 1 modular refactor", "Set up CI/CD pipeline"]
})
```

### Search and Discovery
```javascript
// Semantic search
kg_semantic_search({
  query: "deployment issues and solutions",
  limit: 10
})

// Project state overview
kg_get_project_state({
  project: "personal-kg-v2"
})
```

## 🔒 Privacy & Security

- **Local Storage**: All data stored locally in `.kg` directory
- **No External APIs**: Embeddings computed locally
- **Configurable Visibility**: Private, team, or public node visibility
- **Backup Control**: Configurable backup retention and cleanup

## 📋 Migration from v1.x

This is a standalone v2.0 release extracted from the monorepo. To migrate:

1. Export data from v1.x using `kg_export`
2. Install v2.0 in new directory
3. Import data using `kg_import`
4. Update any scripts to use new repository

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the test suite
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Submit via GitHub Issues
- **Documentation**: See tool descriptions in MCP client
- **Examples**: Check the examples/ directory

## 🚧 Roadmap

- **Phase 1**: Modular architecture refactor
- **Phase 2**: Enhanced search and analytics
- **Phase 3**: Collaboration features
- **Phase 4**: Plugin ecosystem

## 📊 Stats

- **41 Tools**: Complete knowledge management toolkit
- **Self-Documenting**: No external docs needed for basic usage
- **Test Coverage**: 27 comprehensive tests
- **TypeScript**: Full type safety and IDE support