import { KnowledgeNodeType } from "./enums.js";

export const KnowledgeVisibility = ["private", "team", "public"] as const;
export type KnowledgeVisibility = typeof KnowledgeVisibility[number];

export const KnowledgeRelation = [
  "references",
  "relates_to",
  "derived_from",
  "blocks",
  "duplicates",
] as const;
export type KnowledgeRelation = typeof KnowledgeRelation[number];

export interface KnowledgeNode {
  id: string;
  type: typeof KnowledgeNodeType[number];
  content: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  git?: GitContext;
}

export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: KnowledgeRelation;
  createdAt: string; // ISO timestamp
}

export interface CreateNodeInput {
  content: string;
  type: typeof KnowledgeNodeType[number];
  tags?: string[];
  visibility?: KnowledgeVisibility;
  git?: GitContext;
}

export interface GitContext {
  repositoryPath: string;
  currentBranch: string;
  currentCommit: string;
}

export interface ExportPayload {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}


