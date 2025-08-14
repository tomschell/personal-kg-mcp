import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("delete", () => {
    it("deletes node and connected edges when requested", () => {
        const dir = mkdtempSync(join(tmpdir(), "pkg-del-"));
        const storage = new FileStorage({ baseDir: dir });
        const a = storage.createNode({ content: "to delete", type: "idea" });
        const b = storage.createNode({ content: "keep", type: "idea" });
        storage.createEdge(a.id, b.id, "references");
        const edgesDeleted = storage.deleteEdgesForNode(a.id);
        const deleted = storage.deleteNode(a.id);
        expect(deleted).toBe(true);
        expect(edgesDeleted).toBe(1);
        expect(storage.getNode(a.id)).toBeUndefined();
    });
});
