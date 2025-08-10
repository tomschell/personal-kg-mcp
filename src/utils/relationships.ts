import type { KnowledgeNode } from "../types/domain.js";
import { cosineSimilarity, embedText } from "./embeddings.js";

export function scoreRelationship(a: KnowledgeNode, b: KnowledgeNode): number {
  const base = cosineSimilarity(embedText(a.content), embedText(b.content));
  // Simple recency boost: newer nodes get small bonus when related to recent ones
  const ageA = Date.now() - Date.parse(a.updatedAt || a.createdAt);
  const ageB = Date.now() - Date.parse(b.updatedAt || b.createdAt);
  const recency = Math.max(0, 1 - (ageA + ageB) / (1000 * 60 * 60 * 24 * 30)); // within ~30 days
  return Math.min(1, Math.max(0, base * 0.9 + recency * 0.1));
}


