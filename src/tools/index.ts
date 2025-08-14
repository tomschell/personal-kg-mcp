// Personal KG MCP Tools - Modular Architecture
// This file exports all tool setup functions for the modular architecture

export { setupCoreTools } from './core.js';
export { setupSearchTools } from './search.js';
export { setupRelationshipTools } from './relationships.js';
export { setupMaintenanceTools } from './maintenance.js';
export { setupAnalysisTools } from './analysis.js';
export { setupProjectTools } from './project.js';
export { setupDeprecatedTools } from './deprecated.js';

// Re-export types that tools might need
export type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export type { FileStorage } from '../storage/FileStorage.js';
