import { describe, it, expect } from "vitest";
import { getHealth } from "../handlers/health.js";
import { setupAllTools } from "../tools/index.js";

describe("personal-kg-mcp", () => {
  it("health handler returns ok", () => {
    const { result } = getHealth();
    expect(result.status).toBe("ok");
    expect(result.name).toBe("personal-kg-mcp");
  });

  it("exposes exactly 17 tools with required names", () => {
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

    // Consolidated tool names (16 tools total)
    const expected = [
      // Core tools
      "kg_capture",
      "kg_link_session",
      "kg_update_node",

      // Search tools
      "kg_search",
      "kg_query_context",
      "kg_list_tags",
      "kg_get_relevant_context",

      // Relationship tools (consolidated)
      "kg_edges",

      // Maintenance tools (consolidated)
      "kg_admin",

      // Analysis tools (consolidated)
      "kg_analyze",

      // Project tools
      "kg_get_project_state",
      "kg_session_warmup",
      "kg_node",
      "kg_capture_session",
      "kg_open_questions",
      "kg_resolve_question",
    ];

    expect(expected.length).toBe(16);
    for (const name of expected) expect(toolNames).toContain(name);
    expect(toolNames.length).toBe(expected.length);
  });
});
