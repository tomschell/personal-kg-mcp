import type { KnowledgeNode } from "../types/domain.js";

export interface EmergingConcept {
  keyword: string;
  recent: number;
  past: number;
  lift: number;
}

function keywordFreq(nodes: KnowledgeNode[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of nodes) {
    const content = n.content.toLowerCase();
    for (const w of content.match(/[a-z0-9]{4,}/g) ?? []) {
      m.set(w, (m.get(w) ?? 0) + 1);
    }
    for (const t of n.tags) {
      const k = t.toLowerCase();
      if (k.length > 2) m.set(k, (m.get(k) ?? 0) + 2);
    }
  }
  return m;
}

export function findEmergingConcepts(
  nodes: KnowledgeNode[],
  windowDays = 7,
  minRecent = 2,
  minLift = 2,
): EmergingConcept[] {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const recent = nodes.filter((n) => Date.parse(n.createdAt) >= cutoff);
  const past = nodes.filter((n) => Date.parse(n.createdAt) < cutoff);
  const fr = keywordFreq(recent);
  const fp = keywordFreq(past);
  const out: EmergingConcept[] = [];
  for (const [k, v] of fr.entries()) {
    const prev = fp.get(k) ?? 0;
    const lift = (v + 1) / (prev + 1);
    if (v >= minRecent && lift >= minLift) out.push({ keyword: k, recent: v, past: prev, lift });
  }
  out.sort((a, b) => b.lift - a.lift);
  return out.slice(0, 50);
}


