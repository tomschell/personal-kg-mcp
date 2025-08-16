import { describe, it, expect, afterEach } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { rmSync } from "fs";

describe("time range query", () => {
  it("filters by createdAt and query", () => {
    const s = new FileStorage({ baseDir: ".kg-test-time" });
    const a = s.createNode({ content: "first", type: "idea" });
    // wait-ish by modifying updatedAt/createdAt (simulate)
    const b = s.createNode({
      content: "second mentions git",
      type: "idea",
      tags: ["git"],
    });
    const start = a.createdAt;
    const end = new Date(Date.now() + 1000).toISOString();
    const results = s.listByTimeRange({ start, end, query: "git" });
    expect(results.some((n) => n.id === b.id)).toBe(true);
  });

  afterEach(() => {
    // Clean up test storage directory
    try {
      rmSync(".kg-test-time", { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist or can't be removed
      console.warn("Failed to clean up .kg-test-time directory:", error);
    }
  });
});
