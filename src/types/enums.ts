export const KnowledgeNodeType = [
  "idea",
  "decision",
  "progress",
  "insight",
  "question",
  "session",
] as const;

export type KnowledgeNodeType = typeof KnowledgeNodeType[number];

export const ServerStatus = [
  "ok",
  "error",
] as const;

export type ServerStatus = typeof ServerStatus[number];

export const ImportanceLevel = [
  "high",
  "medium",
  "low",
] as const;
export type ImportanceLevel = typeof ImportanceLevel[number];


