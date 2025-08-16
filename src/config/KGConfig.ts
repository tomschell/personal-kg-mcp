export interface KGConfig {
  storage?: {
    path?: string;
  };
  github?: {
    enabled?: boolean;
    token?: string;
  };
  mcp?: {
    capture?: {
      enabled?: boolean;
      tools?: string[];
      exclude?: string[];
      autoCapture?: boolean;
    };
  };
}

export interface MCPCaptureConfig {
  enabled: boolean;
  tools: string[];
  exclude: string[];
  autoCapture: boolean;
}

/**
 * Load Personal KG configuration from environment variables (set via MCP configuration)
 * Priority:
 * 1. Environment variables (from .cursor/mcp.json env settings)
 * 2. Defaults
 */
export function loadKGConfig(): KGConfig {
  // Load from environment variables (configured in .cursor/mcp.json)
  const config: KGConfig = {
    storage: {
      path: process.env.PKG_STORAGE_DIR
    },
    github: {
      enabled: process.env.PKG_GITHUB_INTEGRATION_ENABLED === 'true' && !!process.env.PKG_GITHUB_TOKEN,
      token: process.env.PKG_GITHUB_TOKEN
    },
    mcp: {
      capture: {
        enabled: process.env.PKG_MCP_CAPTURE_ENABLED !== 'false',
        tools: process.env.PKG_MCP_CAPTURE_TOOLS?.split(',').map(t => t.trim()) || ['github'],
        exclude: process.env.PKG_MCP_CAPTURE_EXCLUDE?.split(',').map(t => t.trim()) || [],
        autoCapture: process.env.PKG_MCP_CAPTURE_AUTO !== 'false'
      }
    }
  };

  // Apply defaults
  return {
    storage: {
      path: config.storage?.path ?? '.kg'
    },
    github: {
      enabled: config.github?.enabled ?? false,
      token: config.github?.token
    },
    mcp: {
      capture: {
        enabled: config.mcp?.capture?.enabled ?? true,
        tools: config.mcp?.capture?.tools ?? ['github'],
        exclude: config.mcp?.capture?.exclude ?? [],
        autoCapture: config.mcp?.capture?.autoCapture ?? true
      }
    }
  };
}

/**
 * Get MCP capture configuration with proper defaults
 */
export function getMCPCaptureConfig(): MCPCaptureConfig {
  const config = loadKGConfig();
  return {
    enabled: config.mcp?.capture?.enabled ?? true,
    tools: config.mcp?.capture?.tools ?? ['github'],
    exclude: config.mcp?.capture?.exclude ?? [],
    autoCapture: config.mcp?.capture?.autoCapture ?? true
  };
}

/**
 * Check if GitHub integration is enabled
 */
export function isGitHubEnabled(): boolean {
  const config = loadKGConfig();
  return config.github?.enabled ?? false;
}

/**
 * Get GitHub token if available
 */
export function getGitHubToken(): string | undefined {
  const config = loadKGConfig();
  return config.github?.token;
}

/**
 * Get storage path with fallback
 */
export function getStoragePath(): string {
  const config = loadKGConfig();
  return config.storage?.path ?? '.kg';
}

/**
 * Validate configuration and return any issues
 */
export function validateConfig(): string[] {
  const issues: string[] = [];
  const config = loadKGConfig();

  // Check storage path
  if (!config.storage?.path) {
    issues.push('Storage path is not configured');
  }

  // Check GitHub configuration
  if (config.github?.enabled && !config.github?.token) {
    issues.push('GitHub integration is enabled but no token is provided');
  }

  // Check MCP capture configuration
  if (config.mcp?.capture?.enabled) {
    if (!config.mcp.capture.tools || config.mcp.capture.tools.length === 0) {
      issues.push('MCP capture is enabled but no tools are specified');
    }
  }

  return issues;
}
