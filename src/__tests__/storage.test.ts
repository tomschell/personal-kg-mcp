import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStorage } from "../storage/FileStorage.js";

describe("FileStorage", () => {
  let baseDir: string;
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "pkg-test-"));
  });

  it("creates and retrieves a node", () => {
    const storage = new FileStorage({ baseDir });
    const node = storage.createNode({ content: "hello", type: "idea" });
    const found = storage.getNode(node.id);
    expect(found?.id).toBe(node.id);
    expect(found?.content).toBe("hello");
  });

  it("lists recent nodes", () => {
    const storage = new FileStorage({ baseDir });
    storage.createNode({ content: "a", type: "idea" });
    storage.createNode({ content: "b", type: "idea" });
    const list = storage.listRecent(2);
    expect(list.length).toBe(2);
  });
});


