import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { buildGraphExport } from "../utils/graph.js";
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
});
