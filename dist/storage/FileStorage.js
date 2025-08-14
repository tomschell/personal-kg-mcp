import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, readdirSync, statSync, } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ExportPayloadSchema, KnowledgeEdgeSchema, KnowledgeNodeSchema, } from "../types/schemas.js";
import { LruCache } from "./Cache.js";
export class FileStorage {
    baseDir;
    nodeCache = new LruCache(256);
    constructor(config) {
        this.baseDir = config.baseDir;
        mkdirSync(this.nodesDir, { recursive: true });
        mkdirSync(this.edgesDir, { recursive: true });
    }
    get nodesDir() {
        return join(this.baseDir, "nodes");
    }
    get edgesDir() {
        return join(this.baseDir, "edges");
    }
    // Expose edges directory path for maintenance tools that need direct file access
    getEdgesDir() {
        return this.edgesDir;
    }
    createNode(input) {
        const id = randomUUID();
        const now = new Date().toISOString();
        const node = {
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
    getNode(id) {
        const cached = this.nodeCache.get(id);
        if (cached)
            return cached;
        const file = join(this.nodesDir, `${id}.json`);
        if (!existsSync(file))
            return undefined;
        const node = JSON.parse(readFileSync(file, "utf8"));
        this.nodeCache.set(id, node);
        return node;
    }
    updateNode(id, changes) {
        const file = join(this.nodesDir, `${id}.json`);
        if (!existsSync(file))
            return undefined;
        const node = JSON.parse(readFileSync(file, "utf8"));
        if (typeof changes.content === "string")
            node.content = changes.content;
        if (typeof changes.appendContent === "string" && changes.appendContent) {
            node.content = `${node.content}\n${changes.appendContent}`.trim();
        }
        if (Array.isArray(changes.tags))
            node.tags = changes.tags;
        if (Array.isArray(changes.mergeTags) && changes.mergeTags.length > 0) {
            const set = new Set(node.tags);
            for (const t of changes.mergeTags)
                set.add(t);
            node.tags = Array.from(set);
        }
        if (changes.visibility)
            node.visibility = changes.visibility;
        if (changes.importance)
            node.importance = changes.importance;
        if (changes.git)
            node.git = changes.git;
        node.updatedAt = new Date().toISOString();
        writeFileSync(file, JSON.stringify(node, null, 2), "utf8");
        this.nodeCache.set(id, node);
        return node;
    }
    listRecent(limit = 20) {
        // naive scan ordered by updatedAt desc
        const dir = this.nodesDir;
        const entries = readdirSync(dir).filter((f) => f.endsWith(".json"));
        const nodes = entries.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
        return nodes
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit);
    }
    listAllNodes() {
        const entries = readdirSync(this.nodesDir).filter((f) => f.endsWith(".json"));
        return entries.map((f) => JSON.parse(readFileSync(join(this.nodesDir, f), "utf8")));
    }
    listByTimeRange(params) {
        const { start, end, query } = params;
        const startTs = start ? Date.parse(start) : undefined;
        const endTs = end ? Date.parse(end) : undefined;
        const q = (query ?? "").toLowerCase();
        return this.listAllNodes().filter((n) => {
            const ts = Date.parse(n.createdAt);
            if (startTs && ts < startTs)
                return false;
            if (endTs && ts > endTs)
                return false;
            if (q &&
                !n.content.toLowerCase().includes(q) &&
                !n.tags.some((t) => t.toLowerCase().includes(q)))
                return false;
            return true;
        });
    }
    searchNodes(params) {
        const { query, tags, type } = params;
        const limit = params.limit ?? 20;
        const entries = readdirSync(this.nodesDir).filter((f) => f.endsWith(".json"));
        const nodes = entries.map((f) => JSON.parse(readFileSync(join(this.nodesDir, f), "utf8")));
        const q = (query ?? "").toLowerCase();
        const filtered = nodes.filter((n) => {
            if (type && n.type !== type)
                return false;
            if (tags && tags.length > 0 && !tags.every((t) => n.tags.includes(t)))
                return false;
            if (q &&
                !(n.content.toLowerCase().includes(q) ||
                    n.tags.some((t) => t.toLowerCase().includes(q))))
                return false;
            return true;
        });
        return filtered
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit);
    }
    createEdge(fromNodeId, toNodeId, relation, extra) {
        const id = randomUUID();
        const edge = {
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
    listEdges(nodeId) {
        const entries = readdirSync(this.edgesDir).filter((f) => f.endsWith(".json"));
        const edges = entries.map((f) => JSON.parse(readFileSync(join(this.edgesDir, f), "utf8")));
        if (!nodeId)
            return edges;
        return edges.filter((e) => e.fromNodeId === nodeId || e.toNodeId === nodeId);
    }
    deleteNode(id) {
        const file = join(this.nodesDir, `${id}.json`);
        if (!existsSync(file))
            return false;
        rmSync(file);
        this.nodeCache.delete(id);
        return true;
    }
    deleteEdgesForNode(nodeId) {
        const entries = readdirSync(this.edgesDir).filter((f) => f.endsWith(".json"));
        let deleted = 0;
        for (const f of entries) {
            const p = join(this.edgesDir, f);
            const e = JSON.parse(readFileSync(p, "utf8"));
            if (e.fromNodeId === nodeId || e.toNodeId === nodeId) {
                rmSync(p);
                deleted++;
            }
        }
        return deleted;
    }
    exportAll() {
        const nodeFiles = readdirSync(this.nodesDir).filter((f) => f.endsWith(".json"));
        const edgeFiles = readdirSync(this.edgesDir).filter((f) => f.endsWith(".json"));
        const nodes = nodeFiles.map((f) => KnowledgeNodeSchema.parse(JSON.parse(readFileSync(join(this.nodesDir, f), "utf8"))));
        const edges = edgeFiles.map((f) => KnowledgeEdgeSchema.parse(JSON.parse(readFileSync(join(this.edgesDir, f), "utf8"))));
        return { nodes, edges };
    }
    importAll(payload) {
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
    backup(retentionDays = 30) {
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
    validate() {
        let invalidNodes = 0;
        let invalidEdges = 0;
        for (const f of readdirSync(this.nodesDir)) {
            if (!f.endsWith(".json"))
                continue;
            try {
                KnowledgeNodeSchema.parse(JSON.parse(readFileSync(join(this.nodesDir, f), "utf8")));
            }
            catch {
                invalidNodes++;
            }
        }
        for (const f of readdirSync(this.edgesDir)) {
            if (!f.endsWith(".json"))
                continue;
            try {
                KnowledgeEdgeSchema.parse(JSON.parse(readFileSync(join(this.edgesDir, f), "utf8")));
            }
            catch {
                invalidEdges++;
            }
        }
        return {
            ok: invalidNodes === 0 && invalidEdges === 0,
            invalidNodes,
            invalidEdges,
        };
    }
    repair() {
        const quarantine = join(this.baseDir, "quarantine", Date.now().toString());
        mkdirSync(quarantine, { recursive: true });
        let removedNodes = 0;
        let removedEdges = 0;
        // Nodes
        for (const f of readdirSync(this.nodesDir)) {
            if (!f.endsWith(".json"))
                continue;
            const p = join(this.nodesDir, f);
            try {
                KnowledgeNodeSchema.parse(JSON.parse(readFileSync(p, "utf8")));
            }
            catch {
                cpSync(p, join(quarantine, f));
                rmSync(p);
                removedNodes++;
            }
        }
        // Edges
        for (const f of readdirSync(this.edgesDir)) {
            if (!f.endsWith(".json"))
                continue;
            const p = join(this.edgesDir, f);
            try {
                KnowledgeEdgeSchema.parse(JSON.parse(readFileSync(p, "utf8")));
            }
            catch {
                cpSync(p, join(quarantine, f));
                rmSync(p);
                removedEdges++;
            }
        }
        return { removedNodes, removedEdges, quarantinedDir: quarantine };
    }
}
