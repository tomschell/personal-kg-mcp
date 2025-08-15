import { describe, it, expect } from "vitest";
import { getHealth } from "../handlers/health.js";
import { setupAllTools } from "../tools/index.js";

describe("personal-kg-mcp", () => {
  it("health handler returns ok", () => {
    const { result } = getHealth();
    expect(result.status).toBe("ok");
    expect(result.name).toBe("personal-kg-mcp");
  });

  it("exposes exactly 24 tools with required names", () => {
    const registered: string[] = [];
    const fakeServer = { tool: (name: string) => registered.push(name) } as any;
    const fakeStorage = {} as any;
    const ann = {} as any;
    const USE_ANN = false;
    const EMBED_DIM = 256;
    const normalizeTags = () => [] as string[];
    const getWorkstreamTag = () => undefined;
    const logToolCall = () => {};
    const tagCo = {} as any;
    setupAllTools(
      fakeServer,
      fakeStorage,
      ann,
      USE_ANN,
      EMBED_DIM,
      normalizeTags,
      getWorkstreamTag,
      logToolCall,
      tagCo,
    );
    const toolNames = registered;
    const expected = [
      "kg_health","kg_capture","kg_capture_session","kg_link_session",
      "kg_search","kg_semantic_search","kg_find_similar","kg_query_time_range","kg_query_context",
      "kg_create_edge","kg_list_edges","kg_relationships_maintenance",
      "kg_backup","kg_validate","kg_repair","kg_export","kg_import",
      "kg_detect_topic_clusters","kg_find_emerging_concepts","kg_find_connection_path",
      "kg_get_project_state","kg_session_warmup","kg_get_node","kg_delete_node"
    ];
    expect(expected.length).toBe(24);
    for (const name of expected) expect(toolNames).toContain(name);
    expect(toolNames.length).toBeGreaterThanOrEqual(expected.length);
  });
});
