import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("backup & validate", () => {
    it("creates backup and validates data", () => {
        const baseDir = mkdtempSync(join(tmpdir(), "pkg-bak-"));
        const storage = new FileStorage({ baseDir });
        storage.createNode({ content: "ok", type: "idea" });
        const { backupDir } = storage.backup(0); // immediate retention cleanup of older not applicable
        expect(backupDir).toContain("backups");
        const v = storage.validate();
        expect(v.ok).toBe(true);
    });
    it("detects invalid files", () => {
        const baseDir = mkdtempSync(join(tmpdir(), "pkg-bad-"));
        const storage = new FileStorage({ baseDir });
        // write invalid node
        const badFile = join(baseDir, "nodes", "bad.json");
        writeFileSync(badFile, "{not-json}");
        const v = storage.validate();
        expect(v.ok).toBe(false);
        expect(v.invalidNodes).toBeGreaterThan(0);
    });
});
