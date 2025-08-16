import { describe, it, expect, afterEach } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { buildGraphExport } from "../utils/graph.js";
import { rmSync } from "fs";

describe("graph export", () => {
  it("exports nodes and edges", () => {
    const s = new FileStorage({ baseDir: ".kg-test-graph" });
    const a = s.createNode({ content: "alpha", type: "idea", tags: ["x"] });
    const b = s.createNode({ content: "beta", type: "insight", tags: ["y"] });
    s.createEdge(a.id, b.id, "relates_to", { strength: 0.5 });
    const g = buildGraphExport(s);
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  afterEach(() => {
    // Clean up test storage directory
    try {
      rmSync(".kg-test-graph", { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist or can't be removed
      console.warn("Failed to clean up .kg-test-graph directory:", error);
    }
  });
});
