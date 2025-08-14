import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("search", () => {
    it("filters by query, tags and type", () => {
        const baseDir = mkdtempSync(join(tmpdir(), "pkg-search-"));
        const storage = new FileStorage({ baseDir });
        storage.createNode({ content: "Implement git integration", type: "insight", tags: ["git", "integration"] });
        storage.createNode({ content: "Write tests for storage", type: "progress", tags: ["tests"] });
        const results1 = storage.searchNodes({ query: "git" });
        expect(results1.length).toBe(1);
        const results2 = storage.searchNodes({ tags: ["tests"], type: "progress" });
        expect(results2.length).toBe(1);
    });
});
