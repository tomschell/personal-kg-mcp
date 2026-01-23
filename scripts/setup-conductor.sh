#!/bin/bash
# =============================================================================
# Personal KG MCP - Conductor Workspace Setup
# =============================================================================
# Sets up environment for Conductor workspaces using 1Password Environments
#
# What this does:
# 1. Creates .env symlink to Hoist's 1Password-managed .env (contains OPENAI_API_KEY)
# 2. Sets up symlinks in both installed location and current workspace
# 3. Verifies the symlink works
#
# Prerequisites:
# - 1Password desktop app with Environments feature enabled
# - Hoist project with .env managed by 1Password Environments
# - personal-kg-mcp installed at ~/.local/share/personal-kg/
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "Personal KG MCP - Conductor Setup"
echo "=============================================="

# Configuration
HOIST_ENV="$HOME/Coding/Hoistv2/.env"
PKG_INSTALL_DIR="$HOME/.local/share/personal-kg"
PKG_STORAGE_DIR="$PKG_INSTALL_DIR/.kg"

# Detect if we're in a Conductor workspace
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if Hoist .env exists (1Password managed)
if [ ! -e "$HOIST_ENV" ]; then
    echo -e "${RED}Error: Hoist .env not found at $HOIST_ENV${NC}"
    echo "Make sure 1Password Environments is configured for Hoist."
    exit 1
fi

# Verify it's a 1Password managed file (FIFO or contains 1Password header)
if [ -p "$HOIST_ENV" ]; then
    echo -e "${GREEN}Found 1Password Environment (FIFO): $HOIST_ENV${NC}"
elif grep -q "1Password" "$HOIST_ENV" 2>/dev/null; then
    echo -e "${GREEN}Found 1Password managed file: $HOIST_ENV${NC}"
else
    echo -e "${YELLOW}Warning: $HOIST_ENV may not be 1Password managed${NC}"
fi

# Create symlink in installed location
echo ""
echo "Setting up installed location..."
if [ -L "$PKG_INSTALL_DIR/.env" ]; then
    echo "  Symlink already exists: $PKG_INSTALL_DIR/.env"
    ls -la "$PKG_INSTALL_DIR/.env"
elif [ -f "$PKG_INSTALL_DIR/.env" ]; then
    echo -e "${YELLOW}  Warning: Regular file exists at $PKG_INSTALL_DIR/.env${NC}"
    echo "  Backing up and replacing..."
    mv "$PKG_INSTALL_DIR/.env" "$PKG_INSTALL_DIR/.env.backup.$(date +%Y%m%d%H%M%S)"
    ln -sf "$HOIST_ENV" "$PKG_INSTALL_DIR/.env"
    echo -e "${GREEN}  Created symlink: $PKG_INSTALL_DIR/.env -> $HOIST_ENV${NC}"
else
    ln -sf "$HOIST_ENV" "$PKG_INSTALL_DIR/.env"
    echo -e "${GREEN}  Created symlink: $PKG_INSTALL_DIR/.env -> $HOIST_ENV${NC}"
fi

# Create symlink in current Conductor workspace (if applicable)
if [[ "$WORKSPACE_ROOT" == *"/conductor/workspaces/"* ]]; then
    echo ""
    echo "Setting up Conductor workspace..."
    WORKSPACE_ENV="$WORKSPACE_ROOT/.env"

    if [ -L "$WORKSPACE_ENV" ]; then
        echo "  Symlink already exists: $WORKSPACE_ENV"
    elif [ -f "$WORKSPACE_ENV" ]; then
        echo -e "${YELLOW}  Warning: Regular file exists at $WORKSPACE_ENV${NC}"
        echo "  Backing up and replacing..."
        mv "$WORKSPACE_ENV" "$WORKSPACE_ENV.backup.$(date +%Y%m%d%H%M%S)"
        ln -sf "$HOIST_ENV" "$WORKSPACE_ENV"
        echo -e "${GREEN}  Created symlink: $WORKSPACE_ENV -> $HOIST_ENV${NC}"
    else
        ln -sf "$HOIST_ENV" "$WORKSPACE_ENV"
        echo -e "${GREEN}  Created symlink: $WORKSPACE_ENV -> $HOIST_ENV${NC}"
    fi
fi

# Verify OPENAI_API_KEY is accessible
echo ""
echo "Verifying environment..."
if OPENAI_KEY=$(cat "$PKG_INSTALL_DIR/.env" 2>/dev/null | grep "^OPENAI_API_KEY=" | cut -d= -f2 | cut -c1-20); then
    if [ -n "$OPENAI_KEY" ]; then
        echo -e "${GREEN}  OPENAI_API_KEY: ${OPENAI_KEY}...${NC}"
    else
        echo -e "${RED}  OPENAI_API_KEY not found in .env${NC}"
        exit 1
    fi
else
    echo -e "${RED}  Failed to read .env file${NC}"
    exit 1
fi

# Check if MCP server is installed
echo ""
echo "Checking MCP server installation..."
if [ -d "$PKG_INSTALL_DIR/node_modules/@tomschell/personal-kg-mcp" ]; then
    echo -e "${GREEN}  MCP server installed at $PKG_INSTALL_DIR${NC}"
else
    echo -e "${YELLOW}  MCP server not installed. Run: npm install @tomschell/personal-kg-mcp${NC}"
fi

# Check storage directory
echo ""
echo "Checking storage..."
if [ -d "$PKG_STORAGE_DIR" ]; then
    NODE_COUNT=$(ls -1 "$PKG_STORAGE_DIR/nodes" 2>/dev/null | wc -l | tr -d ' ')
    echo -e "${GREEN}  Storage directory: $PKG_STORAGE_DIR ($NODE_COUNT nodes)${NC}"
else
    echo -e "${YELLOW}  Storage directory not found (will be created on first use)${NC}"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Restart Claude Code to reload MCP servers"
echo "2. Run: kg_admin({ operation: 'migrate_embeddings' })"
echo "   to backfill OpenAI embeddings for existing nodes"
echo ""
