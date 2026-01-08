// Export all tool setup functions for modular architecture
import { setupCoreTools } from "./core.js";
import { setupSearchTools, setupContextTools } from "./search.js";
import { setupRelationshipTools } from "./relationships.js";
import { setupMaintenanceTools } from "./maintenance.js";
import { setupAnalysisTools } from "./analysis.js";
import { setupProjectTools, setupQuestionTools } from "./project.js";

export { setupCoreTools, setupSearchTools, setupContextTools, setupRelationshipTools, setupMaintenanceTools, setupAnalysisTools, setupProjectTools, setupQuestionTools };

// Main setup function that registers all tools
export function setupAllTools(
  server: any,
  storage: any,
  ann: any,
  USE_ANN: boolean,
  EMBED_DIM: number,
  normalizeTags: (base?: string[], project?: string, workstream?: string, ticket?: string) => string[],
  getWorkstreamTag: (tags: string[]) => string | undefined,
  logToolCall: (name: string, args?: unknown) => void,
  tagCo: any
) {
  setupCoreTools(server, storage, ann, USE_ANN, EMBED_DIM, normalizeTags, getWorkstreamTag, logToolCall);
  setupSearchTools(server, storage, ann, USE_ANN, EMBED_DIM, tagCo);
  setupContextTools(server, storage, EMBED_DIM);
  setupRelationshipTools(server, storage);
  setupMaintenanceTools(server, storage);
  setupAnalysisTools(server, storage);
  setupProjectTools(server, storage);
  setupQuestionTools(server, storage);
}
