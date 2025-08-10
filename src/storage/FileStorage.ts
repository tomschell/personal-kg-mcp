import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CreateNodeInput, KnowledgeEdge, KnowledgeNode } from "../types/domain.js";

export interface FileStorageConfig {
  baseDir: string;
}

export class FileStorage {
  private readonly baseDir: string;

  constructor(config: FileStorageConfig) {
    this.baseDir = config.baseDir;
    mkdirSync(this.nodesDir, { recursive: true });
    mkdirSync(this.edgesDir, { recursive: true });
  }

  private get nodesDir(): string {
    return join(this.baseDir, "nodes");
  }

  private get edgesDir(): string {
    return join(this.baseDir, "edges");
  }

  createNode(input: CreateNodeInput): KnowledgeNode {
    const id = randomUUID();
    const now = new Date().toISOString();
    const node: KnowledgeNode = {
      id,
      type: input.type,
      content: input.content,
      tags: input.tags ?? [],
      visibility: input.visibility ?? "private",
      createdAt: now,
      updatedAt: now,
      git: input.git,
    };
    const file = join(this.nodesDir, `${id}.json`);
    writeFileSync(file, JSON.stringify(node, null, 2), "utf8");
    return node;
  }

  getNode(id: string): KnowledgeNode | undefined {
    const file = join(this.nodesDir, `${id}.json`);
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, "utf8")) as KnowledgeNode;
  }

  listRecent(limit = 20): KnowledgeNode[] {
    // naive scan ordered by updatedAt desc
    const dir = this.nodesDir;
    const fs = require("node:fs") as typeof import("node:fs");
    const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const nodes: KnowledgeNode[] = entries.map((f) => JSON.parse(fs.readFileSync(join(dir, f), "utf8")));
    return nodes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }

  createEdge(fromNodeId: string, toNodeId: string, relation: KnowledgeEdge["relation"]): KnowledgeEdge {
    const id = randomUUID();
    const edge: KnowledgeEdge = { id, fromNodeId, toNodeId, relation, createdAt: new Date().toISOString() };
    const file = join(this.edgesDir, `${id}.json`);
    writeFileSync(file, JSON.stringify(edge, null, 2), "utf8");
    return edge;
  }

  listEdges(nodeId?: string): KnowledgeEdge[] {
    const fs = require("node:fs") as typeof import("node:fs");
    const entries = fs.readdirSync(this.edgesDir).filter((f) => f.endsWith(".json"));
    const edges: KnowledgeEdge[] = entries.map((f) => JSON.parse(fs.readFileSync(join(this.edgesDir, f), "utf8")));
    if (!nodeId) return edges;
    return edges.filter((e) => e.fromNodeId === nodeId || e.toNodeId === nodeId);
  }
}


