export const KnowledgeNodeType = [
  "idea",
  "decision",
  "progress",
  "insight",
  "question",
] as const;

export type KnowledgeNodeType = typeof KnowledgeNodeType[number];

export const ServerStatus = [
  "ok",
  "error",
] as const;

export type ServerStatus = typeof ServerStatus[number];


