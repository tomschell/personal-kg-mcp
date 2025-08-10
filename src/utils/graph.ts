import type { FileStorage } from "../storage/FileStorage.js";

export function buildGraphExport(storage: FileStorage) {
  const nodesRaw = storage.listAllNodes();
  const edgesRaw = storage.listEdges();
  const nodes = nodesRaw.map((n) => ({
    id: n.id,
    type: n.type,
    importance: n.importance ?? "medium",
    label: (n.content || "").slice(0, 80),
    tags: n.tags,
  }));
  const edges = edgesRaw.map((e) => ({
    id: e.id,
    from: e.fromNodeId,
    to: e.toNodeId,
    relation: e.relation,
    strength: e.strength ?? null,
  }));
  return { nodes, edges };
}


