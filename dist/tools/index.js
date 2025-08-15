// Export all tool setup functions for modular architecture
import { setupCoreTools } from "./core.js";
import { setupSearchTools } from "./search.js";
import { setupRelationshipTools } from "./relationships.js";
import { setupMaintenanceTools } from "./maintenance.js";
import { setupAnalysisTools } from "./analysis.js";
import { setupProjectTools } from "./project.js";
export { setupCoreTools, setupSearchTools, setupRelationshipTools, setupMaintenanceTools, setupAnalysisTools, setupProjectTools };
// Main setup function that registers all tools
export function setupAllTools(server, storage, ann, USE_ANN, EMBED_DIM, normalizeTags, getWorkstreamTag, logToolCall, tagCo) {
    setupCoreTools(server, storage, ann, USE_ANN, EMBED_DIM, normalizeTags, getWorkstreamTag, logToolCall);
    setupSearchTools(server, storage, ann, USE_ANN, EMBED_DIM, tagCo);
    setupRelationshipTools(server, storage);
    setupMaintenanceTools(server, storage);
    setupAnalysisTools(server, storage);
    setupProjectTools(server, storage);
}
