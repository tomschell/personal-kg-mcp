import { describe, it, expect } from "vitest";
import { reconstructContext } from "../utils/context.js";

describe("context reconstruction", () => {
  it("summarizes key points and decisions for a topic", () => {
    const now = new Date().toISOString();
    const nodes = [
      { id: "1", type: "decision", content: "Decide to capture git branch and commit.", tags: ["git"], visibility: "private", createdAt: now, updatedAt: now },
      { id: "2", type: "question", content: "How to store embeddings?", tags: ["query"], visibility: "private", createdAt: now, updatedAt: now },
      { id: "3", type: "idea", content: "Use hashed bag-of-words embeddings for now.", tags: ["query"], visibility: "private", createdAt: now, updatedAt: now },
    ] as any;
    const summary = reconstructContext(nodes, "git");
    expect(summary.topic).toBe("git");
    expect(summary.decisions.length).toBeGreaterThan(0);
    expect(summary.keyPoints.length).toBeGreaterThan(0);
  });
});


