import { describe, it, expect } from "vitest";
import type { KnowledgeNode } from "../types/domain.js";
import { clusterBySimilarity } from "../utils/clustering.js";
import { findEmergingConcepts } from "../utils/emerging.js";

function n(content: string, daysAgo = 0, tags: string[] = []): KnowledgeNode {
  const now = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const ts = new Date(now).toISOString();
  return {
    id: Math.random().toString(36).slice(2),
    type: "idea",
    content,
    tags,
    visibility: "private",
    createdAt: ts,
    updatedAt: ts,
  } as KnowledgeNode;
}

describe("analysis tools", () => {
  it("clusters related nodes by similarity", () => {
    const nodes = [
      n("Topic clustering in KG", 0, ["kg"]),
      n("Clustering topics for knowledge graph", 0, ["kg"]),
      n("Sailing boat hull types", 0, ["boats"]),
      n("Keel and hull specifications", 0, ["boats"]),
    ];
    const clusters = clusterBySimilarity(nodes, 0.2);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    const sizes = clusters.map((c) => c.nodes.length).sort((a, b) => b - a);
    expect(sizes[0]).toBeGreaterThanOrEqual(2);
  });

  it("finds emerging concepts with higher recent frequency", () => {
    const nodes = [
      n("We discuss clustering algorithms for KG", 10, ["kg", "clustering"]),
      n("Old note about boats and hulls", 30, ["boats"]),
      n("New clustering method for topics", 1, ["clustering"]),
      n("Clustering test and evaluation", 2, ["clustering"]),
    ];
    const emerging = findEmergingConcepts(nodes, 7, 2, 1.5);
    expect(emerging.some((e) => e.keyword.includes("clustering"))).toBe(true);
  });
});


