import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CreateNodeInput, KnowledgeEdge, KnowledgeNode, ExportPayload } from "../types/domain.js";
import { ExportPayloadSchema, KnowledgeEdgeSchema, KnowledgeNodeSchema } from "../types/schemas.js";
import { LruCache } from "./Cache.js";

export interface FileStorageConfig {
  baseDir: string;
}

export class FileStorage {
  private readonly baseDir: string;
  private readonly nodeCache = new LruCache<string, KnowledgeNode>(256);

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
      importance: input.importance,
    };
    const file = join(this.nodesDir, `${id}.json`);
    writeFileSync(file, JSON.stringify(node, null, 2), "utf8");
    this.nodeCache.set(id, node);
    return node;
  }

  getNode(id: string): KnowledgeNode | undefined {
    const cached = this.nodeCache.get(id);
    if (cached) return cached;
    const file = join(this.nodesDir, `${id}.json`);
    if (!existsSync(file)) return undefined;
    const node = JSON.parse(readFileSync(file, "utf8")) as KnowledgeNode;
    this.nodeCache.set(id, node);
    return node;
  }

  listRecent(limit = 20): KnowledgeNode[] {
    // naive scan ordered by updatedAt desc
    const dir = this.nodesDir;
    const fs = require("node:fs") as typeof import("node:fs");
    const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const nodes: KnowledgeNode[] = entries.map((f) => JSON.parse(fs.readFileSync(join(dir, f), "utf8")));
    return nodes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }

  searchNodes(params: {
    query?: string;
    tags?: string[];
    type?: KnowledgeNode["type"];
    limit?: number;
  }): KnowledgeNode[] {
    const { query, tags, type } = params;
    const limit = params.limit ?? 20;
    const fs = require("node:fs") as typeof import("node:fs");
    const entries = fs.readdirSync(this.nodesDir).filter((f) => f.endsWith(".json"));
    const nodes: KnowledgeNode[] = entries.map((f) => JSON.parse(fs.readFileSync(join(this.nodesDir, f), "utf8")));
    const q = (query ?? "").toLowerCase();
    const filtered = nodes.filter((n) => {
      if (type && n.type !== type) return false;
      if (tags && tags.length > 0 && !tags.every((t) => n.tags.includes(t))) return false;
      if (q && !(n.content.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))) return false;
      return true;
    });
    return filtered
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
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

  deleteNode(id: string): boolean {
    const file = join(this.nodesDir, `${id}.json`);
    if (!existsSync(file)) return false;
    rmSync(file);
    this.nodeCache.delete(id);
    return true;
  }

  deleteEdgesForNode(nodeId: string): number {
    const fs = require("node:fs") as typeof import("node:fs");
    const entries = fs.readdirSync(this.edgesDir).filter((f) => f.endsWith(".json"));
    let deleted = 0;
    for (const f of entries) {
      const p = join(this.edgesDir, f);
      const e = JSON.parse(fs.readFileSync(p, "utf8")) as KnowledgeEdge;
      if (e.fromNodeId === nodeId || e.toNodeId === nodeId) {
        fs.rmSync(p);
        deleted++;
      }
    }
    return deleted;
  }

  exportAll(): ExportPayload {
    const fs = require("node:fs") as typeof import("node:fs");
    const nodeFiles = fs.readdirSync(this.nodesDir).filter((f: string) => f.endsWith(".json"));
    const edgeFiles = fs.readdirSync(this.edgesDir).filter((f: string) => f.endsWith(".json"));
    const nodes: KnowledgeNode[] = nodeFiles.map((f: string) => KnowledgeNodeSchema.parse(JSON.parse(fs.readFileSync(join(this.nodesDir, f), "utf8"))));
    const edges: KnowledgeEdge[] = edgeFiles.map((f: string) => KnowledgeEdgeSchema.parse(JSON.parse(fs.readFileSync(join(this.edgesDir, f), "utf8"))));
    return { nodes, edges };
  }

  importAll(payload: ExportPayload): { nodes: number; edges: number } {
    const parsed = ExportPayloadSchema.parse(payload);
    for (const node of parsed.nodes) {
      const file = join(this.nodesDir, `${node.id}.json`);
      writeFileSync(file, JSON.stringify(node, null, 2), "utf8");
    }
    for (const edge of parsed.edges) {
      const file = join(this.edgesDir, `${edge.id}.json`);
      writeFileSync(file, JSON.stringify(edge, null, 2), "utf8");
    }
    return { nodes: parsed.nodes.length, edges: parsed.edges.length };
  }

  backup(retentionDays = 30): { backupDir: string } {
    const date = new Date().toISOString().slice(0, 10);
    const backupDir = join(this.baseDir, "backups", date);
    mkdirSync(backupDir, { recursive: true });
    cpSync(this.nodesDir, join(backupDir, "nodes"), { recursive: true });
    cpSync(this.edgesDir, join(backupDir, "edges"), { recursive: true });
    // retention: delete older than N days
    const fs = require("node:fs") as typeof import("node:fs");
    const backupsParent = join(this.baseDir, "backups");
    for (const entry of fs.readdirSync(backupsParent)) {
      const path = join(backupsParent, entry);
      const stat = fs.statSync(path);
      const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > retentionDays) fs.rmSync(path, { recursive: true, force: true });
    }
    return { backupDir };
  }

  validate(): { ok: boolean; invalidNodes: number; invalidEdges: number } {
    const fs = require("node:fs") as typeof import("node:fs");
    let invalidNodes = 0;
    let invalidEdges = 0;
    for (const f of fs.readdirSync(this.nodesDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        KnowledgeNodeSchema.parse(JSON.parse(fs.readFileSync(join(this.nodesDir, f), "utf8")));
      } catch {
        invalidNodes++;
      }
    }
    for (const f of fs.readdirSync(this.edgesDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        KnowledgeEdgeSchema.parse(JSON.parse(fs.readFileSync(join(this.edgesDir, f), "utf8")));
      } catch {
        invalidEdges++;
      }
    }
    return { ok: invalidNodes === 0 && invalidEdges === 0, invalidNodes, invalidEdges };
  }
}


