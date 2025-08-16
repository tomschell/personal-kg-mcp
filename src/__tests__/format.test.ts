import { describe, it, expect } from "vitest";
import { formatNode, formatNodes } from "../utils/format.js";
import type { KnowledgeNode } from "../types/domain.js";

function makeNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: "n1",
    type: "idea",
    content: "This is a long content string used to test summary truncation.".repeat(3),
    tags: ["proj:kg", "example"],
    visibility: "team",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    importance: "medium",
    ...overrides,
  } as KnowledgeNode;
}

describe("formatNode", () => {
  it("returns full by default with metadata", () => {
    const n = makeNode();
    const r = formatNode(n);
    expect(r).toHaveProperty("id", n.id);
    expect(r).toHaveProperty("type", n.type);
    expect(r).toHaveProperty("content");
    expect(r).toHaveProperty("tags");
    expect(r).toHaveProperty("createdAt");
    expect(r).toHaveProperty("updatedAt");
    expect(r).toHaveProperty("visibility");
  });

  it("truncates content in summary mode and omits metadata", () => {
    const n = makeNode();
    const r = formatNode(n, { format: "summary", summaryLength: 50 });
    expect(typeof r.content).toBe("string");
    expect((r.content as string).length).toBeLessThanOrEqual(51); // includes ellipsis
    expect(r).not.toHaveProperty("git");
    expect(r).not.toHaveProperty("createdAt");
  });

  it("omits content/tags/metadata in minimal unless flags override", () => {
    const n = makeNode();
    const r = formatNode(n, { format: "minimal" });
    expect(r).not.toHaveProperty("content");
    expect(r).not.toHaveProperty("tags");
    expect(r).not.toHaveProperty("createdAt");

    const r2 = formatNode(n, { format: "minimal", includeContent: true, includeTags: true });
    expect(r2).toHaveProperty("content");
    expect(r2).toHaveProperty("tags");
  });

  it("formats an array with formatNodes", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })];
    const arr = formatNodes(nodes, { format: "summary", summaryLength: 30 });
    expect(arr).toHaveLength(2);
    expect(arr[0]).toHaveProperty("id", "a");
    expect(typeof arr[0].content).toBe("string");
  });
});


