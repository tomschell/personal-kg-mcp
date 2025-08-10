import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";

describe("time range query", () => {
  it("filters by createdAt and query", () => {
    const s = new FileStorage({ baseDir: ".kg-test-time" });
    const a = s.createNode({ content: "first", type: "idea" });
    // wait-ish by modifying updatedAt/createdAt (simulate)
    const b = s.createNode({ content: "second mentions git", type: "idea", tags: ["git"] });
    const start = a.createdAt;
    const end = new Date(Date.now() + 1000).toISOString();
    const results = s.listByTimeRange({ start, end, query: "git" });
    expect(results.some((n) => n.id === b.id)).toBe(true);
  });
});


