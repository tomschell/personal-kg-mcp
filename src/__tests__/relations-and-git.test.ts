import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("relations and git context", () => {
  it("creates nodes and an edge via storage, preserves git context when provided", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-rel-"));
    const storage = new FileStorage({ baseDir });
    const a = storage.createNode({ content: "A", type: "idea", git: { repositoryPath: "/repo", currentBranch: "main", currentCommit: "abc" } });
    const b = storage.createNode({ content: "B", type: "idea" });
    const edge = storage.createEdge(a.id, b.id, "references");
    expect(edge.fromNodeId).toBe(a.id);
    expect(edge.toNodeId).toBe(b.id);
    const recent = storage.listRecent(10);
    expect(recent.find(n => n.id === a.id)?.git?.currentBranch).toBe("main");
  });
});


