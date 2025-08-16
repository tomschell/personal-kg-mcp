# Personal Knowledge Graph MCP

A Model Context Protocol (MCP) server for maintaining a local, private knowledge graph of decisions, progress, insights, and questions during development.

## Overview

The Personal KG MCP server provides tools to capture, search, and manage knowledge during development work. It focuses on essential functionality to reduce cognitive load while maintaining a comprehensive knowledge base.

## Why Personal Knowledge Graph?

### The Problem
As developers, we constantly make decisions, solve problems, and gain insights that get lost in the noise of daily work. Important context disappears when:
- Switching between projects or tasks
- Returning to code after time away
- Onboarding new team members
- Debugging issues that resurface months later
- Trying to remember "why we did it that way"

**But the biggest challenge is agentic development**: AI assistants like Claude and Cursor start each session with zero context about your project history, decisions, and progress. Every conversation becomes a ground-up explanation, wasting time and losing valuable context.

### The Solution
A Personal Knowledge Graph captures your development journey as it happens, creating a searchable, connected memory of your work. Think of it as a second brain that:
- **Remembers everything** - Decisions, progress, insights, and questions
- **Connects the dots** - Links related work across time and projects
- **Provides context** - Gives you the full story when you need it
- **Scales with you** - Grows more valuable over time

**For agentic development, it's your AI assistant's memory**: The Personal KG gives AI tools like Claude and Cursor instant access to your project context, decisions, and progress history. No more starting from scratch every session.

**It's effectively a communications layer** between you and your AI assistants, between different development sessions, and between team members. It bridges the gap between human context and AI capabilities.

### Key Benefits

#### 🧠 **Reduced Cognitive Load**
- Stop trying to remember everything
- Focus on current work, not context switching
- Quick access to relevant background information

#### 🔄 **Seamless Context Switching**
- Resume any project with full context
- Understand the "why" behind past decisions
- Pick up where you left off, even months later
- **AI assistants start with full project context** - No more explaining your codebase from scratch

#### 📈 **Accelerated Learning**
- Build on past insights and avoid repeating mistakes
- Track your problem-solving patterns
- Identify recurring challenges and solutions

#### 🤝 **Better Collaboration**
- Share context with team members
- Document decisions for future reference
- Maintain institutional knowledge
- **AI-human collaboration** - Your AI assistant understands your project as well as you do
- **Communications bridge** - Seamless information flow between human context and AI capabilities

#### 🎯 **Improved Decision Making**
- Reference similar past situations
- Understand the full impact of decisions
- Track the evolution of your thinking

### Real-World Scenarios

**Scenario 1: AI Assistant Session Continuity**
> "I'm starting a new session with Claude to work on the authentication system. How do I avoid explaining the entire project history again?"

**With Personal KG**: `kg_session_warmup({ project: "auth-system" })` gives your AI assistant instant context about recent decisions, blockers, and progress - no more ground-up explanations.

**Scenario 2: Returning to a Project**
> "I need to work on the authentication system again, but it's been 3 months. What was I thinking about the OAuth flow?"

**With Personal KG**: `kg_session_warmup({ project: "auth-system" })` gives you recent decisions, blockers, and context in seconds.

**Scenario 3: Debugging a Recurring Issue**
> "This database connection error feels familiar. Have I seen this before?"

**With Personal KG**: `kg_semantic_search("database connection timeout")` finds related debugging sessions and solutions.

**Scenario 4: Onboarding a New Developer**
> "I need to explain our architecture decisions to the new team member."

**With Personal KG**: `kg_query_context("architecture decisions")` provides a comprehensive overview of key decisions and reasoning.

**Scenario 5: Planning a Refactor**
> "I want to refactor this module, but I need to understand what depends on it."

**With Personal KG**: `kg_get_project_state("module-refactor")` shows related work, dependencies, and potential impacts.

### How It Fits Your Workflow

The Personal KG integrates seamlessly with your existing development tools:

#### **🔄 Daily Development Cycle**
1. **Start work** → `kg_session_warmup()` gets you and your AI assistant up to speed
2. **During coding** → `kg_capture()` records decisions and progress
3. **Link related work** → `kg_create_edge()` connects related concepts
4. **End session** → `kg_capture_session()` summarizes and plans next steps

#### **🛠️ Tool Integration**
- **MCP Protocol** - Works with Claude, Cursor, and other AI assistants
- **GitHub Integration** - Automatically captures issue and PR context
- **Local Storage** - Your data stays private and under your control
- **Search & Discovery** - Find relevant information when you need it
- **Session Continuity** - AI assistants maintain context across sessions
- **Communications Layer** - Bridges human context and AI capabilities seamlessly

#### **📊 Knowledge Growth**
Your Personal KG becomes more valuable over time:
- **Week 1**: Basic decision tracking
- **Month 1**: Pattern recognition and context building
- **Month 6**: Comprehensive project history and insights
- **Year 1**: Institutional knowledge and learning acceleration

## Quick Start

### Installation

1. **Configure MCP Server** in `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "personal-kg-cursor": {
      "command": "node",
      "args": ["packages/personal-kg-mcp/dist/server.cjs"],
      "cwd": "packages/personal-kg-mcp",
      "env": {
        "PKG_STORAGE_DIR": ".kg",
        "PKG_GITHUB_INTEGRATION_ENABLED": "true",
        "PKG_MCP_CAPTURE_ENABLED": "true"
      }
    }
  }
}
```

2. **Set up GitHub Integration** (optional):
   - Create a GitHub Personal Access Token
   - Add to `.env` file: `PKG_GITHUB_TOKEN=github_pat_your_token_here`
   - Or set as environment variable

3. **Build the server**:
```bash
cd packages/personal-kg-mcp
npm install
npm run build
```

### Basic Usage

Start with these 8 essential tools:

| Purpose | Tool |
|---------|------|
| Health check | `kg_health` |
| Session warmup | `kg_session_warmup` |
| Capture decisions/progress | `kg_capture` |
| Session summaries | `kg_capture_session` |
| Search | `kg_semantic_search` |
| Project overview | `kg_get_project_state` |
| Recent activity | `kg_list_recent` |
| Link nodes | `kg_create_edge` |

## Configuration

The Personal KG MCP server is configured through environment variables set in `.cursor/mcp.json`.

### Storage Configuration

**`PKG_STORAGE_DIR`**
- **Description**: Directory path for Personal KG storage
- **Default**: `.kg`
- **Example**: `"PKG_STORAGE_DIR": "data/knowledge/personal"`

### GitHub Integration

**`PKG_GITHUB_INTEGRATION_ENABLED`**
- **Description**: Enable/disable GitHub integration in session warmup
- **Default**: `false` (disabled by default for security)
- **Values**: `"true"` or `"false"`
- **Note**: Requires `PKG_GITHUB_TOKEN` to be set to actually enable

**`PKG_GITHUB_TOKEN`**
- **Description**: GitHub Personal Access Token for Personal KG integration
- **Default**: Not set
- **Security**: Store in `.env` file, not in version control

### MCP Capture Configuration

**`PKG_MCP_CAPTURE_ENABLED`**
- **Description**: Enable/disable automatic capture of MCP tool calls
- **Default**: `true`

**`PKG_MCP_CAPTURE_TOOLS`**
- **Description**: Comma-separated list of MCP tool names to capture
- **Default**: `"github"`
- **Example**: `"PKG_MCP_CAPTURE_TOOLS": "obsidian,notion,github"`

**`PKG_MCP_CAPTURE_EXCLUDE`**
- **Description**: Comma-separated list of MCP tool names to exclude
- **Default**: `""` (empty)

**`PKG_MCP_CAPTURE_AUTO`**
- **Description**: Enable automatic capture without explicit calls
- **Default**: `"true"`

### Example Configuration

```json
{
  "mcpServers": {
    "personal-kg-cursor": {
      "command": "node",
      "args": ["packages/personal-kg-mcp/dist/server.cjs"],
      "cwd": "packages/personal-kg-mcp",
      "env": {
        "PKG_STORAGE_DIR": ".kg",
        "PKG_AUTO_BACKUP_MINUTES": "0",
        "PKG_USE_ANN": "true",
        "PKG_GITHUB_INTEGRATION_ENABLED": "true",
        "PKG_MCP_CAPTURE_ENABLED": "true",
        "PKG_MCP_CAPTURE_TOOLS": "github",
        "PKG_MCP_CAPTURE_EXCLUDE": "",
        "PKG_MCP_CAPTURE_AUTO": "true"
      }
    }
  }
}
```

## Usage Guide

### Tag Conventions
- Normalised tags: `proj:<name>`, `ws:<workstream>`, `ticket:<id>`  
- Examples: `proj:kg`  `ws:kg-dev`  `ticket:78`

### Proactive Behavior
1. Capture key moments with **kg_capture** (decisions, progress, insights, questions).  
2. At session boundaries use **kg_capture_session** (include `next_actions[]`).  
3. When resuming a topic call **kg_query_context** or **kg_get_project_state**.  
4. Link entries to the active session and mark dependencies with **kg_create_edge**.

### Core Tools

#### Health
| Tool | Purpose |
|------|---------|
| **kg_health** | Confirm MCP server availability |

#### Capture
| Tool | Args (required **bold**) | Notes |
|------|--------------------------|-------|
| **kg_capture** | **content**, type∈idea\|decision\|progress\|insight\|question, tags?, visibility?, includeGit?, importance∈high\|medium\|low, auto_link?, sessionId?, project?, workstream?, ticket? | Primary knowledge creation |
| **kg_capture_session** | **summary**, duration?, artifacts?, **next_actions[]**, visibility?, importance? | Session summaries |

#### Relationships
| Tool | Args | Notes |
|------|------|-------|
| **kg_create_edge** | **fromNodeId**, **toNodeId**, **relation**∈references\|relates_to\|derived_from\|blocks\|duplicates | Single relationship creation |
| **kg_list_edges** | nodeId? | |
| **kg_link_session** | **sessionId**, **nodeId** | Link a session to a node (session → node, references) |

#### Search & Retrieval
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

#### Maintenance & Data
| Tool | Args | Notes |
|------|------|-------|
| **kg_relationships_maintenance** | rebuildThreshold?, pruneThreshold?, limit? | Rebuild + prune relationships |
| **kg_validate** |  | Structural check |
| **kg_repair** |  | Auto-fix minor issues |
| **kg_backup** | retentionDays? | Zip export w/ retention policy |
| **kg_export / kg_import** | (payload) | Full JSON export / import |
| **kg_graph_export** |  | Mermaid-compatible graph |

### Relationship Type Guide
| Relation | When to use | Example |
|----------|-------------|---------|
| references | Loose citation / mention | Session note references design doc |
| relates_to | General topical overlap | Two progress nodes on same feature |
| derived_from | Work or idea builds on another | Refactor derived_from original design decision |
| blocks | Hard dependency ordering | Bug fix blocks release task |
| duplicates | Identical or redundant content | Duplicate question captured twice |

### Best-Practice Flow
1. **Start / resume** → `kg_health`, then `kg_session_warmup({ project: "kg", limit: 20 })`  
2. **Before starting work** → `kg_query_context` to get relevant background
3. **During dev** → `kg_capture` with `sessionId` + tags  
4. **Link related work** → `kg_create_edge` (relation="blocks" or "derived_from")  
5. **End session** → `kg_capture_session`, then `kg_relationships_maintenance`

### Examples

#### Session Warmup
```json
{
  "tool": "kg_session_warmup",
  "args": { "project": "kg", "limit": 20 }
}
```

#### Capture Progress
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

#### Session Summary
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

#### Link Related Work
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

#### Get Context Before Starting
```json
{
  "tool": "kg_query_context",
  "args": { "topic": "CI/CD pipeline improvements" }
}
```

## Advanced Tools (Reference Only)

These tools are available but rarely needed:

- `kg_find_connection_path` - Find relationship path between nodes
- `kg_detect_topic_clusters` - Discover clusters/themes
- `kg_find_emerging_concepts` - Detect new concepts over time
- `kg_query_time_range` - Time-window queries
- `kg_delete_node` - Delete nodes with edge cleanup

## Deprecated Tools (Avoid)

These tools will be removed in future releases:

- `kg_mark_blocks`, `kg_mark_blocked_by`, `kg_mark_derived_from`, `kg_mark_affects` - Use `kg_create_edge` instead
- `kg_rebuild_relationships`, `kg_prune_weak_relationships` - Use `kg_relationships_maintenance` instead
- `capture_context`, `capture_session` - Use `kg_capture`, `kg_capture_session` instead
- `kg_search_minimal` - Use `kg_search` or `kg_semantic_search` instead
- `kg_query_context_expanded` - Use `kg_query_context` instead
- `kg_reclassify_relationships` - Use `kg_relationships_maintenance` instead

## Development

### Building
```bash
cd packages/personal-kg-mcp
npm install
npm run build
```

### Testing
```bash
npm test
npm run test:unit
npm test -- config.test.ts --run
```

### Development Mode
```bash
npm run dev
```

## Changelog

### [2.1.0] - 2025-08-16
- **Configuration System**: Centralized configuration management via environment variables
- **GitHub Integration**: Configurable GitHub integration with secure token handling
- **MCP Capture**: Configurable automatic capture of MCP tool calls
- **Security**: GitHub integration disabled by default, secure token storage recommendations

### [2.0.0] - 2025-08-14
- **Modular Architecture**: Refactored from monolithic 1,625-line server to modular structure
- **Core Tools Module**: kg_health, kg_capture, kg_capture_session, kg_link_session
- **Search Tools Module**: kg_list_recent, kg_search, kg_semantic_search, kg_find_similar, kg_query_time_range, kg_query_context
- **Relationship Tools Module**: 10 relationship management tools
- **Maintenance Tools Module**: 5 maintenance tools
- **Analysis Tools Module**: 4 analysis tools
- **Project Tools Module**: 3 project tools
- **Deprecated Tools Module**: 6 deprecated tools
- **Comprehensive Documentation**: Detailed architecture guide
- **GitHub Repository**: Standalone repository at https://github.com/tomschell/personal-kg-mcp
- **CI/CD Pipeline**: GitHub Actions for testing, building, and deployment

### [1.0.0] - 2025-01-01
- Initial Personal KG MCP server implementation
- 43 tools for knowledge graph management
- File-based storage system
- Vector similarity search
- Relationship management
- Session management
- Project state tracking

## License

MIT License - see LICENSE file for details.
