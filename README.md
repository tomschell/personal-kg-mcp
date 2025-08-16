Decision intelligence for multi-agent workflows

⸻

🚨 The Problem: Context Evaporates

Multi-agent development is fast—but context gets lost at every handoff:
        •       Planning sessions → compressed into short GitHub issues
        •       Architecture debates → collapsed into one-line directives in Cursor
        •       Implementation agents → see what to do, not why

Result: Tasks move quickly, but decisions lose their reasoning. Context exists somewhere—it just doesn't travel.

⸻

✅ The Solution: Auto-Captured Decision Context

Personal KG preserves the "why" behind every decision—automatically, without extra work.

Captured context includes:
        •       Full reasoning chains
        •       Alternatives considered + rejected
        •       Constraints & trade-offs that shaped choices
        •       Idea evolution across planning sessions
        •       Nuanced context beyond specs

⸻

🔁 The Learning Loop

Personal KG isn't just storage—it's a continuous improvement engine:
        •       Accountability → Every directive is traceable to its reasoning
        •       Auditability → Agent actions are explainable and reviewable
        •       Reflection & Analysis → See what worked, what failed, and improve continuously

⸻

🌊 Impact: From Compressed Tasks to Full Context

Before Personal KG
        •       Stripped-down tasks
        •       Fragmented context
        •       Agents move fast but blind

After Personal KG
        •       Tasks + reasoning, constraints, and alternatives
        •       Rich context flows seamlessly across tools
        •       Agents move fast with full understanding

⸻


👉 Personal KG = Never lose the why. Capture it once, use it everywhere.

## Installation

### NPM Package

The Personal KG MCP server is available as an NPM package:

```bash
npm install @tomschell/personal-kg-mcp
```

### MCP Configuration

1. **Configure MCP Server** in `.cursor/mcp.json` or your MCP client configuration:

```json
{
  "mcpServers": {
    "personal-kg-mcp": {
      "command": "node",
      "args": [
        "node_modules/@tomschell/personal-kg-mcp/dist/server.js"
      ],
      "cwd": "/path/to/your/project",
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

2. **Set up GitHub Integration** (optional):
   - Create a GitHub Personal Access Token
   - Add to `.env` file: `PKG_GITHUB_TOKEN=github_pat_your_token_here`
   - Or set as environment variable

3. **Restart your MCP client** (Cursor, Claude Desktop, etc.)

### Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PKG_STORAGE_DIR` | `.kg` | Directory for storing knowledge graph data |
| `PKG_AUTO_BACKUP_MINUTES` | `0` | Auto-backup interval (0 = disabled) |
| `PKG_USE_ANN` | `true` | Use approximate nearest neighbor search |
| `PKG_GITHUB_INTEGRATION_ENABLED` | `false` | Enable GitHub issue/PR integration |
| `PKG_MCP_CAPTURE_ENABLED` | `true` | Auto-capture MCP tool calls |
| `PKG_MCP_CAPTURE_TOOLS` | `github` | Tools to capture (comma-separated) |
| `PKG_MCP_CAPTURE_EXCLUDE` | `""` | Tools to exclude (comma-separated) |
| `PKG_MCP_CAPTURE_AUTO` | `true` | Auto-capture without explicit calls |

## Quick Start

npm install @tomschell/personal-kg-mcp

### Installation

1. **Configure MCP Server** in `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "personal-kg-mcp": {
      "command": "node",
      "args": [
        "node_modules/@tomschell/personal-kg-mcp/dist/server.js"
      ],
      "cwd": "/path/to/your/project",
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

2. **Set up GitHub Integration** (optional):
   - Create a GitHub Personal Access Token
   - Add to `.env` file: `PKG_GITHUB_TOKEN=github_pat_your_token_here`
   - Or set as environment variable

3. **Restart your MCP client** (Cursor, Claude Desktop, etc.)

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
    "personal-kg-mcp": {
      "command": "node",
      "args": [
        "node_modules/@tomschell/personal-kg-mcp/dist/server.js"
      ],
      "cwd": "/path/to/your/project",
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
