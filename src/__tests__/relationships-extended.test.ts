import { describe, it, expect } from "vitest";
import type { KnowledgeNode } from "../types/domain.js";
import { computeStrengthFactors, scoreRelationship, classifyRelationship } from "../utils/relationships.js";

function makeNode(overrides: Partial<KnowledgeNode>): KnowledgeNode {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    type: (overrides as KnowledgeNode).type ?? "idea",
    content: overrides.content ?? "",
    tags: overrides.tags ?? [],
    visibility: overrides.visibility ?? "private",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    git: overrides.git,
    importance: overrides.importance,
  } as KnowledgeNode;
}

describe("relationship scoring extensions", () => {
  it("includes tag/commit explicit references in the score", () => {
    const a = makeNode({ content: "Work on git integration", tags: ["git", "commit:abcdef0"] });
    const b = makeNode({ content: "Capture commit:abcdef0 in nodes", tags: ["notes"] });
    const c = makeNode({ content: "Capture commits generically", tags: ["notes"] });

    const sAB = scoreRelationship(a, b);
    const sAC = scoreRelationship(a, c);
    expect(sAB).toBeGreaterThan(sAC);

    const f = computeStrengthFactors(a, b);
    expect(f.explicitReferences).toBeGreaterThan(0);
  });

  it("boosts recent pairs over old pairs (temporal proximity)", () => {
    const recentA = makeNode({ content: "Topic clustering", tags: ["kg"] });
    const recentB = makeNode({ content: "KG clustering topic", tags: ["kg"] });
    const oldTs = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // ~90 days ago
    const oldA = makeNode({ content: "Topic clustering", tags: ["kg"], createdAt: oldTs, updatedAt: oldTs });
    const oldB = makeNode({ content: "KG clustering topic", tags: ["kg"], createdAt: oldTs, updatedAt: oldTs });

    const sRecent = scoreRelationship(recentA, recentB);
    const sOld = scoreRelationship(oldA, oldB);
    expect(sRecent).toBeGreaterThan(sOld);
  });

  it("classifies relationship type using simple heuristics", () => {
    const a = makeNode({ content: "This builds on the previous design for embeddings.", tags: ["design"] });
    const b = makeNode({ content: "Embedding design draft.", tags: ["design"] });
    const rel1 = classifyRelationship(a, b);
    expect(rel1 === "derived_from" || rel1 === "references").toBe(true);

    const c = makeNode({ content: "This implementation is blocked by missing config.", tags: ["blocked"] });
    const d = makeNode({ content: "Missing config ADR.", tags: ["adr"] });
    const rel2 = classifyRelationship(c, d);
    expect(rel2).toBe("blocks");
  });
});


