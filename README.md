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

> ⚠️ **Important**: MCP servers are only loaded at session startup. After adding or modifying the MCP configuration, you **must restart** your Claude Code, Cursor, or Claude Desktop session for the tools to become available. Simply saving the config file is not enough.

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

Start with these essential tools:

| Purpose | Tool |
|---------|------|
| Session warmup | `kg_session_warmup` |
| Capture decisions/progress | `kg_capture` |
| Session summaries | `kg_capture_session` |
| Search | `kg_search` (mode: semantic) |
| Project overview | `kg_get_project_state` |
| Get context | `kg_get_relevant_context` |
| Track questions | `kg_open_questions` |
| Link nodes | `kg_edges` (operation: create) |

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

### Agent Training Reminders

**Important for Developers**: The `kg_session_warmup` tool includes an `agentTrainingReminders` field. These reminders are **NOT user-facing documentation** - they are designed to train AI agents on proper development workflows during coding sessions.

**Purpose:**
- Train agents on commit frequency and git best practices
- Guide agents to follow project workflow conventions
- Improve agent behavior through consistent guidance
- Ensure code quality and proper git usage

**Who sees this:**
- AI agents during session warmup (embedded in context)
- Developers reading the code
- **NOT** end users browsing documentation

Users benefit from these reminders indirectly through improved agent behavior, not by reading them directly.

### Proactive Behavior
1. Capture key moments with **kg_capture** (decisions, progress, insights, questions).
2. At session boundaries use **kg_capture_session** (include `next_actions[]`).
3. When resuming a topic call **kg_get_relevant_context** or **kg_get_project_state**.
4. Track open questions with **kg_open_questions** and resolve with **kg_resolve_question**.
5. Link entries with **kg_edges** (operation: "create", relation: "blocks" or "derived_from").

### Core Tools

#### Capture
| Tool | Args (required **bold**) | Notes |
|------|--------------------------|-------|
| **kg_capture** | **content**, type, tags?, project?, workstream?, ticket?, importance?, visibility?, includeGit?, auto_link?, sessionId? | Primary knowledge creation |
| **kg_capture_session** | **summary**, duration?, artifacts?, next_actions[], visibility?, importance? | Session summaries |
| **kg_link_session** | **sessionId**, **nodeId** | Link session to node |
| **kg_update_node** | **id**, content?, tags?, importance?, visibility? | Update existing nodes |

#### Search & Retrieval
| Tool | Args | Notes |
|------|------|-------|
| **kg_search** | **query**, mode∈text\|semantic\|time_range, tags?, type?, limit?, threshold? | Unified search |
| **kg_query_context** | **topic** | Summarize topic-relevant nodes |
| **kg_get_relevant_context** | **query**, project?, max_items?, include_questions? | Proactive context injection |
| **kg_get_project_state** | **project** | Overview, blockers, decisions |
| **kg_session_warmup** | project?, workstream?, limit?, discover? | Session context warmup |
| **kg_list_tags** | prefix?, minCount?, limit? | List all tags with counts |

#### Node Operations
| Tool | Args | Notes |
|------|------|-------|
| **kg_node** | **operation**∈get\|delete\|find_similar, **id**, deleteEdges?, limit?, threshold? | Unified node ops |

#### Relationships
| Tool | Args | Notes |
|------|------|-------|
| **kg_edges** | **operation**∈create\|list\|maintain, fromNodeId?, toNodeId?, relation?, nodeId?, maintainOp? | Unified edge ops |

#### Question Tracking
| Tool | Args | Notes |
|------|------|-------|
| **kg_open_questions** | project?, include_stale?, limit? | List unresolved questions |
| **kg_resolve_question** | **question_id**, **resolved_by_id**, resolution_note? | Mark question resolved |

#### Admin & Maintenance
| Tool | Args | Notes |
|------|------|-------|
| **kg_admin** | **operation**∈health\|backup\|validate\|repair\|export\|import\|rename_tag\|merge_tags, ... | Unified admin ops |

#### Analysis
| Tool | Args | Notes |
|------|------|-------|
| **kg_analyze** | **operation**∈clusters\|emerging\|path\|graph_export, limit?, threshold?, startId?, endId? | Unified analysis ops |

### Relationship Type Guide
| Relation | When to use | Example |
|----------|-------------|---------|
| references | Loose citation / mention | Session note references design doc |
| relates_to | General topical overlap | Two progress nodes on same feature |
| derived_from | Work or idea builds on another | Refactor derived_from original design decision |
| blocks | Hard dependency ordering | Bug fix blocks release task |
| duplicates | Identical or redundant content | Duplicate question captured twice |

### Best-Practice Flow
1. **Start / resume** → `kg_session_warmup({ project: "my-project" })` (discovery mode if no project)
2. **Before starting work** → `kg_get_relevant_context({ query: "topic" })` for background
3. **During dev** → `kg_capture` decisions, progress, insights, questions
4. **Track questions** → `kg_open_questions` to see unresolved items
5. **Link related work** → `kg_edges({ operation: "create", ... })`
6. **End session** → `kg_capture_session` with summary and next_actions

## Claude Code Integration

Add these instructions to your project's `CLAUDE.md` to enable automatic knowledge graph usage:

```markdown
## Knowledge Graph

This project uses personal-kg-mcp for decision tracking and context management.

### Session Start
- Run `kg_session_warmup` with project name at the start of each session
- Use discovery mode (no project) to see all available projects

### During Work
- Capture important decisions with `kg_capture` (type: "decision")
- Log progress on features with `kg_capture` (type: "progress")
- Record insights and learnings with `kg_capture` (type: "insight")
- Track open questions with `kg_capture` (type: "question")

### Context Retrieval
- Use `kg_get_relevant_context` before starting work on a topic
- Check `kg_open_questions` for unresolved items
- Use `kg_query_context` for topic summaries

### Session End
- Summarize work with `kg_capture_session`
- Include `next_actions` for continuity
```

### Recommended CLAUDE.md Snippet

For projects using personal-kg-mcp, add to your `CLAUDE.md`:

```markdown
## Knowledge Graph
- **MCP Server**: personal-kg-mcp
- **Storage**: `.kg/` (gitignored)
- **Usage**: Capture decisions, track questions, maintain context across sessions
- **Session Start**: Always run `kg_session_warmup` with project name
- **Key Tools**: kg_capture, kg_session_warmup, kg_get_relevant_context, kg_open_questions
```

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
  "tool": "kg_edges",
  "args": {
    "operation": "create",
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

## Consolidated Tools (v3.0)

Tools have been consolidated for easier use:

| Tool | Operations | Description |
|------|------------|-------------|
| `kg_analyze` | clusters, emerging, path, graph_export | Analysis operations |
| `kg_admin` | health, backup, validate, repair, export, import, rename_tag, merge_tags | Admin/maintenance |
| `kg_edges` | create, list, maintain | Relationship management |
| `kg_node` | get, delete, find_similar | Node operations |
| `kg_search` | text, semantic, time_range | Unified search |

### New Features

- `kg_open_questions` - Track unresolved questions with staleness detection
- `kg_resolve_question` - Mark questions as resolved
- `kg_get_relevant_context` - Proactive context injection for queries



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
