import type { CreateNodeInput, ExportPayload, KnowledgeEdge, KnowledgeNode } from "../types/domain.js";

export interface StorageAdapter {
  createNode(input: CreateNodeInput): KnowledgeNode;
  getNode(id: string): KnowledgeNode | undefined;
  listRecent(limit?: number): KnowledgeNode[];
  searchNodes(params: { query?: string; tags?: string[]; type?: KnowledgeNode["type"]; limit?: number }): KnowledgeNode[];
  createEdge(fromNodeId: string, toNodeId: string, relation: KnowledgeEdge["relation"]): KnowledgeEdge;
  listEdges(nodeId?: string): KnowledgeEdge[];
  deleteNode(id: string): boolean;
  deleteEdgesForNode(nodeId: string): number;
  exportAll(): ExportPayload;
  importAll(payload: ExportPayload): { nodes: number; edges: number };
}


