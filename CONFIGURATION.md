# Personal KG Configuration

The Personal KG MCP server can be configured through environment variables set in the `.cursor/mcp.json` file.

## Configuration Options

### Storage Configuration

**`PKG_STORAGE_DIR`**
- **Description**: Directory path for Personal KG storage
- **Default**: `.kg`
- **Example**: `"PKG_STORAGE_DIR": "data/knowledge/personal"`

### GitHub Integration Configuration

**`PKG_GITHUB_INTEGRATION_ENABLED`**
- **Description**: Enable/disable GitHub integration in session warmup
- **Default**: `false` (disabled by default for security)
- **Values**: `"true"` or `"false"`
- **Note**: Requires `PKG_GITHUB_TOKEN` to be set to actually enable

**`PKG_GITHUB_TOKEN`**
- **Description**: GitHub Personal Access Token for Personal KG integration
- **Default**: Not set
- **Example**: `"PKG_GITHUB_TOKEN": "github_pat_..."`

### MCP Capture Configuration

**`PKG_MCP_CAPTURE_ENABLED`**
- **Description**: Enable/disable automatic capture of MCP tool calls
- **Default**: `true`
- **Values**: `"true"` or `"false"`

**`PKG_MCP_CAPTURE_TOOLS`**
- **Description**: Comma-separated list of MCP tool names to capture
- **Default**: `"github"`
- **Example**: `"PKG_MCP_CAPTURE_TOOLS": "obsidian,notion,github"`

**`PKG_MCP_CAPTURE_EXCLUDE`**
- **Description**: Comma-separated list of MCP tool names to exclude from capture
- **Default**: `""` (empty)
- **Example**: `"PKG_MCP_CAPTURE_EXCLUDE": "sensitive-tool,private-data"`

**`PKG_MCP_CAPTURE_AUTO`**
- **Description**: Enable automatic capture without explicit calls
- **Default**: `"true"`
- **Values**: `"true"` or `"false"`

## Example Configuration

```json
{
  "mcpServers": {
    "personal-kg-cursor": {
      "command": "node",
      "args": ["/path/to/personal-kg-mcp/server.cjs"],
      "cwd": "/path/to/personal-kg-mcp",
      "env": {
        "PKG_STORAGE_DIR": ".kg",
        "PKG_AUTO_BACKUP_MINUTES": "0",
        "PKG_USE_ANN": "true",
        "PKG_GITHUB_INTEGRATION_ENABLED": "false",
        "PKG_MCP_CAPTURE_ENABLED": "true",
        "PKG_MCP_CAPTURE_TOOLS": "github",
        "PKG_MCP_CAPTURE_EXCLUDE": "",
        "PKG_MCP_CAPTURE_AUTO": "true"
      }
    }
  }
}
```

## GitHub Integration Setup

To enable GitHub integration:

1. **Create a GitHub Personal Access Token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create a fine-grained token with repository read permissions
   - Recommended name: "Personal-KG-Integration"

2. **Configure the token** (choose one method):

   **Option A: .env File (Recommended)**
   Create `.env` in project root:
   ```env
   PKG_GITHUB_TOKEN=github_pat_your_token_here
   ```
   
   Then in `.cursor/mcp.json`:
   ```json
   "env": {
     "PKG_GITHUB_INTEGRATION_ENABLED": "true"
     // PKG_GITHUB_TOKEN will be picked up from .env file
   }
   ```

   **Option B: Environment Variable**
   ```bash
   # In your shell profile (.zshrc, .bashrc, etc.)
   export PKG_GITHUB_TOKEN="github_pat_your_token_here"
   ```

   **Option C: Direct in MCP Config (Not Recommended)**
   ```json
   "env": {
     "PKG_GITHUB_INTEGRATION_ENABLED": "true",
     "PKG_GITHUB_TOKEN": "github_pat_your_token_here"
   }
   ```
   ⚠️ **Warning**: This exposes the token in version control unless `.cursor/mcp.json` is in `.gitignore`

3. **Security Best Practices**:
   - Use fine-grained tokens with minimal permissions
   - Limit to specific repositories if possible
   - Set reasonable expiration dates
   - **Never commit tokens to version control**
   - Prefer environment variables over hardcoded values

## Behavior When GitHub Integration is Disabled

When GitHub integration is disabled (default behavior):

- ✅ **All Personal KG functionality continues working**
- ✅ **Session warmup returns complete data without GitHub state**
- ✅ **No errors or warnings about missing GitHub integration**
- ✅ **Faster performance (no API calls)**
- ✅ **Clean, focused responses**

## Migration from Previous Versions

The configuration system is backward compatible:

- Existing `PKG_STORAGE_DIR` environment variables continue to work
- GitHub integration is disabled by default (safer)
- No breaking changes to existing functionality

## Testing Configuration

You can test your configuration by running:

```bash
cd packages/personal-kg-mcp
npm test -- config.test.ts --run
```

This will verify that all configuration options are working correctly.
