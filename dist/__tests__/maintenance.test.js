import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("maintenance tools", () => {
    it("backup and validate and repair", () => {
        const baseDir = mkdtempSync(join(tmpdir(), "pkg-maint-"));
        const s = new FileStorage({ baseDir });
        s.createNode({ content: "ok", type: "idea" });
        const b = s.backup(0);
        expect(b.backupDir).toContain("backups");
        const v1 = s.validate();
        expect(v1.ok).toBe(true);
        // inject invalid file
        writeFileSync(join(baseDir, "nodes", "bad.json"), "{oops}");
        const v2 = s.validate();
        expect(v2.ok).toBe(false);
        const rep = s.repair();
        expect(rep.removedNodes + rep.removedEdges).toBeGreaterThan(0);
    });
});
