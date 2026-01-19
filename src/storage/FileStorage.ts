import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  cpSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CreateNodeInput,
  KnowledgeEdge,
  KnowledgeNode,
  ExportPayload,
} from "../types/domain.js";
import {
  ExportPayloadSchema,
  KnowledgeEdgeSchema,
  KnowledgeNodeSchema,
} from "../types/schemas.js";
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

  // Expose edges directory path for maintenance tools that need direct file access
  public getEdgesDir(): string {
    return this.edgesDir;
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

  updateNode(
    id: string,
    changes: {
      content?: string;
      appendContent?: string;
      tags?: string[];
      mergeTags?: string[];
      removeTags?: string[];
      visibility?: KnowledgeNode["visibility"];
      importance?: KnowledgeNode["importance"];
      git?: KnowledgeNode["git"];
      embedding?: number[];
    },
  ): KnowledgeNode | undefined {
    const file = join(this.nodesDir, `${id}.json`);
    if (!existsSync(file)) return undefined;
    const node = JSON.parse(readFileSync(file, "utf8")) as KnowledgeNode;
    if (typeof changes.content === "string") node.content = changes.content;
    if (typeof changes.appendContent === "string" && changes.appendContent) {
      node.content = `${node.content}\n${changes.appendContent}`.trim();
    }
    if (Array.isArray(changes.tags)) node.tags = changes.tags;
    if (Array.isArray(changes.mergeTags) && changes.mergeTags.length > 0) {
      const set = new Set<string>(node.tags);
      for (const t of changes.mergeTags) set.add(t);
      node.tags = Array.from(set);
    }
    if (Array.isArray(changes.removeTags) && changes.removeTags.length > 0) {
      node.tags = node.tags.filter((t) => !changes.removeTags!.includes(t));
    }
    if (changes.visibility) node.visibility = changes.visibility;
    if (changes.importance) node.importance = changes.importance;
    if (changes.git) node.git = changes.git;
    if (Array.isArray(changes.embedding)) node.embedding = changes.embedding;
    node.updatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(node, null, 2), "utf8");
    this.nodeCache.set(id, node);
    return node;
  }

  /**
   * Update only the embedding for a node (doesn't change updatedAt).
   * Used during migration to avoid changing timestamps.
   */
  updateNodeEmbedding(id: string, embedding: number[]): boolean {
    const file = join(this.nodesDir, `${id}.json`);
    if (!existsSync(file)) return false;
    const node = JSON.parse(readFileSync(file, "utf8")) as KnowledgeNode;
    node.embedding = embedding;
    writeFileSync(file, JSON.stringify(node, null, 2), "utf8");
    this.nodeCache.set(id, node);
    return true;
  }

  listRecent(limit = 20): KnowledgeNode[] {
    // naive scan ordered by updatedAt desc
    const dir = this.nodesDir;
    const entries = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const nodes: KnowledgeNode[] = entries.map((f) =>
      JSON.parse(readFileSync(join(dir, f), "utf8")),
    );
    return nodes
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  listAllNodes(): KnowledgeNode[] {
    const entries = readdirSync(this.nodesDir).filter((f) =>
      f.endsWith(".json"),
    );
    return entries.map(
      (f) =>
        JSON.parse(
          readFileSync(join(this.nodesDir, f), "utf8"),
        ) as KnowledgeNode,
    );
  }

  listByTimeRange(params: {
    start?: string;
    end?: string;
    query?: string;
  }): KnowledgeNode[] {
    const { start, end, query } = params;
    const startTs = start ? Date.parse(start) : undefined;
    const endTs = end ? Date.parse(end) : undefined;
    const q = (query ?? "").toLowerCase();
    return this.listAllNodes().filter((n) => {
      const ts = Date.parse(n.createdAt);
      if (startTs && ts < startTs) return false;
      if (endTs && ts > endTs) return false;
      if (
        q &&
        !n.content.toLowerCase().includes(q) &&
        !n.tags.some((t) => t.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }

  searchNodes(params: {
    query?: string;
    tags?: string[];
    type?: KnowledgeNode["type"];
    limit?: number;
  }): KnowledgeNode[] {
    const { query, tags, type } = params;
    const limit = params.limit ?? 20;
    const entries = readdirSync(this.nodesDir).filter((f) =>
      f.endsWith(".json"),
    );
    const nodes: KnowledgeNode[] = entries.map((f) =>
      JSON.parse(readFileSync(join(this.nodesDir, f), "utf8")),
    );
    const q = (query ?? "").toLowerCase();
    const filtered = nodes.filter((n) => {
      if (type && n.type !== type) return false;
      if (tags && tags.length > 0 && !tags.every((t) => n.tags.includes(t)))
        return false;
      if (
        q &&
        !(
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
        )
      )
        return false;
      return true;
    });
    return filtered
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  createEdge(
    fromNodeId: string,
    toNodeId: string,
    relation: KnowledgeEdge["relation"],
    extra?: Partial<KnowledgeEdge>,
  ): KnowledgeEdge {
    const id = randomUUID();
    const edge: KnowledgeEdge = {
      id,
      fromNodeId,
      toNodeId,
      relation,
      createdAt: new Date().toISOString(),
      ...extra,
    };
    const file = join(this.edgesDir, `${id}.json`);
    writeFileSync(file, JSON.stringify(edge, null, 2), "utf8");
    return edge;
  }

  listEdges(nodeId?: string): KnowledgeEdge[] {
    const entries = readdirSync(this.edgesDir).filter((f) =>
      f.endsWith(".json"),
    );
    const edges: KnowledgeEdge[] = entries.map((f) =>
      JSON.parse(readFileSync(join(this.edgesDir, f), "utf8")),
    );
    if (!nodeId) return edges;
    return edges.filter(
      (e) => e.fromNodeId === nodeId || e.toNodeId === nodeId,
    );
  }

  deleteNode(id: string): boolean {
    const file = join(this.nodesDir, `${id}.json`);
    if (!existsSync(file)) return false;
    rmSync(file);
    this.nodeCache.delete(id);
    return true;
  }

  deleteEdgesForNode(nodeId: string): number {
    const entries = readdirSync(this.edgesDir).filter((f) => f.endsWith(".json"));
    let deleted = 0;
    for (const f of entries) {
      const p = join(this.edgesDir, f);
      const e = JSON.parse(readFileSync(p, "utf8")) as KnowledgeEdge;
      if (e.fromNodeId === nodeId || e.toNodeId === nodeId) {
        rmSync(p);
        deleted++;
      }
    }
    return deleted;
  }

  exportAll(): ExportPayload {
    const nodeFiles = readdirSync(this.nodesDir).filter((f: string) =>
      f.endsWith(".json"),
    );
    const edgeFiles = readdirSync(this.edgesDir).filter((f: string) =>
      f.endsWith(".json"),
    );
    const nodes: KnowledgeNode[] = nodeFiles.map((f: string) =>
      KnowledgeNodeSchema.parse(
        JSON.parse(readFileSync(join(this.nodesDir, f), "utf8")),
      ),
    );
    const edges: KnowledgeEdge[] = edgeFiles.map((f: string) =>
      KnowledgeEdgeSchema.parse(
        JSON.parse(readFileSync(join(this.edgesDir, f), "utf8")),
      ),
    );
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
    const backupsParent = join(this.baseDir, "backups");
    for (const entry of readdirSync(backupsParent)) {
      const path = join(backupsParent, entry);
      const stat = statSync(path);
      const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > retentionDays)
        rmSync(path, { recursive: true, force: true });
    }
    return { backupDir };
  }

  validate(): { ok: boolean; invalidNodes: number; invalidEdges: number } {
    let invalidNodes = 0;
    let invalidEdges = 0;
    for (const f of readdirSync(this.nodesDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        KnowledgeNodeSchema.parse(
          JSON.parse(readFileSync(join(this.nodesDir, f), "utf8")),
        );
      } catch {
        invalidNodes++;
      }
    }
    for (const f of readdirSync(this.edgesDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        KnowledgeEdgeSchema.parse(
          JSON.parse(readFileSync(join(this.edgesDir, f), "utf8")),
        );
      } catch {
        invalidEdges++;
      }
    }
    return {
      ok: invalidNodes === 0 && invalidEdges === 0,
      invalidNodes,
      invalidEdges,
    };
  }

  repair(): {
    removedNodes: number;
    removedEdges: number;
    migratedNodes: number;
    quarantinedDir: string;
  } {
    const quarantine = join(this.baseDir, "quarantine", Date.now().toString());
    mkdirSync(quarantine, { recursive: true });
    let removedNodes = 0;
    let removedEdges = 0;
    let migratedNodes = 0;

    // Nodes - try to auto-fix before quarantining
    for (const f of readdirSync(this.nodesDir)) {
      if (!f.endsWith(".json")) continue;
      const p = join(this.nodesDir, f);
      try {
        const raw = JSON.parse(readFileSync(p, "utf8"));

        // Try to fix common missing fields
        let modified = false;
        if (!raw.visibility) {
          raw.visibility = "private";
          modified = true;
        }
        if (!raw.tags) {
          raw.tags = [];
          modified = true;
        }

        // Validate after fixes
        KnowledgeNodeSchema.parse(raw);

        // If we modified, save the fixed version
        if (modified) {
          writeFileSync(p, JSON.stringify(raw, null, 2), "utf8");
          migratedNodes++;
        }
      } catch {
        // Still invalid after fixes - quarantine
        cpSync(p, join(quarantine, f));
        rmSync(p);
        removedNodes++;
      }
    }

    // Edges
    for (const f of readdirSync(this.edgesDir)) {
      if (!f.endsWith(".json")) continue;
      const p = join(this.edgesDir, f);
      try {
        KnowledgeEdgeSchema.parse(JSON.parse(readFileSync(p, "utf8")));
      } catch {
        cpSync(p, join(quarantine, f));
        rmSync(p);
        removedEdges++;
      }
    }

    return { removedNodes, removedEdges, migratedNodes, quarantinedDir: quarantine };
  }
}
