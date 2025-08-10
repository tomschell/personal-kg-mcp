import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { embedText, cosineSimilarity } from "../utils/embeddings.js";

describe("semantic groundwork", () => {
  it("produces higher similarity for related texts", () => {
    const a = embedText("Implement git integration and capture commit context");
    const b = embedText("Capture git commit and branch for knowledge nodes");
    const c = embedText("Sailing boat specifications and hull types");
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });

  it("can list all nodes from storage", () => {
    const s = new FileStorage({ baseDir: ".kg-test-sem" });
    s.createNode({ content: "alpha", type: "idea" });
    const all = s.listAllNodes();
    expect(all.length).toBeGreaterThan(0);
  });
});


