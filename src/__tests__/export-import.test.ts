import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("export/import", () => {
  it("round-trips nodes and edges", () => {
    const dir1 = mkdtempSync(join(tmpdir(), "pkg-exp-"));
    const s1 = new FileStorage({ baseDir: dir1 });
    const a = s1.createNode({ content: "alpha", type: "idea", tags: ["t1"] });
    const b = s1.createNode({ content: "beta", type: "decision", tags: ["t2"] });
    s1.createEdge(a.id, b.id, "references");
    const dump = s1.exportAll();

    const dir2 = mkdtempSync(join(tmpdir(), "pkg-imp-"));
    const s2 = new FileStorage({ baseDir: dir2 });
    const res = s2.importAll(dump);
    expect(res.nodes).toBe(2);
    expect(res.edges).toBe(1);
    expect(s2.getNode(a.id)?.content).toBe("alpha");
  });
});


