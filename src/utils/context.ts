import type { KnowledgeNode } from "../types/domain.js";

function firstSentence(text: string): string {
  const m = text.trim().split(/(?<=[.!?])\s+/)[0];
  return m.slice(0, 200);
}

export function reconstructContext(nodes: KnowledgeNode[], topic: string): {
  topic: string;
  lastDiscussed?: string;
  keyPoints: string[];
  decisions: KnowledgeNode[];
  openQuestions: KnowledgeNode[];
  nextSteps: string[];
} {
  const filtered = nodes.filter(
    (n) =>
      n.content.toLowerCase().includes(topic.toLowerCase()) ||
      n.tags.some((t) => t.toLowerCase().includes(topic.toLowerCase()))
  );
  filtered.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  const lastDiscussed = filtered[0]?.updatedAt ?? filtered[0]?.createdAt;

  const decisions = filtered.filter((n) => n.type === "decision").slice(0, 5);
  const openQuestions = filtered.filter((n) => n.type === "question").slice(0, 5);

  const keyPoints = filtered
    .slice(0, 5)
    .map((n) => firstSentence(n.content))
    .filter(Boolean);

  const nextSteps: string[] = [];
  for (const n of filtered.slice(0, 10)) {
    const lines = n.content.split("\n");
    for (const line of lines) {
      const m = line.match(/^(?:Next\s*Actions?|Next Steps)\s*:\s*(.*)$/i);
      if (m) {
        for (const step of m[1].split(/;|,/)) {
          const s = step.trim();
          if (s) nextSteps.push(s);
        }
      }
    }
  }

  return { topic, lastDiscussed, keyPoints, decisions, openQuestions, nextSteps };
}


