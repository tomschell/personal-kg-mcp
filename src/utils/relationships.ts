import type { KnowledgeNode, KnowledgeRelation } from "../types/domain.js";
import { cosineSimilarity, embedText } from "./embeddings.js";

export interface StrengthFactors {
  contentSimilarity: number; // 0..1
  temporalProximity: number; // 0..1
  explicitReferences: number; // 0..1
  userReinforcement: number; // 0..1 (placeholder: requires feedback loop)
}

const StrengthWeights: Record<keyof StrengthFactors, number> = {
  contentSimilarity: 0.4,
  temporalProximity: 0.2,
  explicitReferences: 0.3,
  userReinforcement: 0.1,
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function extractCommitTags(node: KnowledgeNode): string[] {
  const tags = Array.isArray(node.tags) ? node.tags : [];
  const inTags: string[] = [];
  for (const t of tags) {
    const m = t.match(/^commit:([0-9a-f]{7,40})$/i);
    if (m) inTags.push(m[1].toLowerCase());
  }
  const inContent: string[] = [];
  const re = /\bcommit:([0-9a-f]{7,40})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(node.content))) inContent.push(m[1].toLowerCase());
  return [...new Set([...inTags, ...inContent])];
}

export function computeStrengthFactors(a: KnowledgeNode, b: KnowledgeNode): StrengthFactors {
  // Content similarity
  const contentSimilarity = clamp01(
    cosineSimilarity(embedText(a.content), embedText(b.content)),
  );

  // Temporal proximity: average age within a 30-day window
  const now = Date.now();
  const ageAms = now - Date.parse(a.updatedAt || a.createdAt);
  const ageBms = now - Date.parse(b.updatedAt || b.createdAt);
  const ageDaysAvg = ((ageAms + ageBms) / 2) / (1000 * 60 * 60 * 24);
  const temporalProximity = clamp01(1 - ageDaysAvg / 30);

  // Explicit references: shared commit hashes, direct tag overlap, or explicit cues
  let explicitReferences = 0;
  // Shared commit
  const commitsA = extractCommitTags(a);
  const commitsB = extractCommitTags(b);
  const sharedCommit = commitsA.some((h) => commitsB.includes(h));
  if (sharedCommit) explicitReferences = Math.max(explicitReferences, 1);
  // Tag overlap (non-trivial tags)
  const tagsA = new Set((a.tags || []).map((t) => t.toLowerCase()));
  const tagsB = new Set((b.tags || []).map((t) => t.toLowerCase()));
  const trivial = new Set(["note", "notes", "misc", "general"]);
  let overlapCount = 0;
  for (const t of tagsA) if (tagsB.has(t) && !trivial.has(t)) overlapCount++;
  if (overlapCount > 0) {
    // Cap contribution at 1, scaled by overlap up to 3 tags
    explicitReferences = Math.max(explicitReferences, clamp01(overlapCount / 3));
  }
  // Keyword cues in content
  const text = (a.content + "\n" + b.content).toLowerCase();
  if (/references|refers to|see also|as noted/.test(text)) {
    explicitReferences = Math.max(explicitReferences, 0.6);
  }

  // User reinforcement: not implemented yet; placeholder 0
  const userReinforcement = 0;

  return { contentSimilarity, temporalProximity, explicitReferences, userReinforcement };
}

export function scoreRelationship(a: KnowledgeNode, b: KnowledgeNode): number {
  const f = computeStrengthFactors(a, b);
  const weighted =
    f.contentSimilarity * StrengthWeights.contentSimilarity +
    f.temporalProximity * StrengthWeights.temporalProximity +
    f.explicitReferences * StrengthWeights.explicitReferences +
    f.userReinforcement * StrengthWeights.userReinforcement;
  return clamp01(weighted);
}

export function classifyRelationship(a: KnowledgeNode, b: KnowledgeNode): KnowledgeRelation {
  const textA = a.content.toLowerCase();
  const textB = b.content.toLowerCase();
  const combined = textA + "\n" + textB;

  // Blocking cues
  if (/blocked by|blocked|blocks|waiting on|dependency/i.test(combined)) {
    return "blocks";
  }
  // Derivation cues
  if (/builds on|builds upon|derived from|derives from|extends|refactor of/i.test(combined)) {
    return "derived_from";
  }
  // Duplicate cues
  if (/duplicate|duplicates|same as/i.test(combined)) {
    return "duplicates";
  }
  // Default: general relation or reference
  // If there is an explicit reference signal, choose references
  const f = computeStrengthFactors(a, b);
  if (f.explicitReferences >= 0.6) return "references";
  return "relates_to";
}
