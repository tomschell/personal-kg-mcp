import { describe, it, expect, beforeEach } from "vitest";
import { setupAnalysisTools } from "../tools/analysis.js";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("analysis tools registration", () => {
  it("registers kg_analyze tool", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-analysis-tools-"));
    const storage = new FileStorage({ baseDir });

    const registered: string[] = [];
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, _handler: unknown) => {
        registered.push(name);
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);

    expect(registered).toContain("kg_analyze");
    expect(registered).toHaveLength(1);
  });
});

describe("kg_analyze clusters operation", () => {
  let storage: FileStorage;
  let analyzeHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-clusters-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_analyze") analyzeHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("detects clusters in related content", async () => {
    storage.createNode({
      content: "Topic clustering in knowledge graphs",
      type: "idea",
      tags: ["kg", "clustering"],
    });
    storage.createNode({
      content: "Clustering algorithms for knowledge graph analysis",
      type: "insight",
      tags: ["kg", "clustering"],
    });
    storage.createNode({
      content: "Sailing boat hull types and specifications",
      type: "idea",
      tags: ["boats", "hull"],
    });
    storage.createNode({
      content: "Hull design considerations for sailboats",
      type: "insight",
      tags: ["boats", "hull"],
    });

    const result = await analyzeHandler({ operation: "clusters", limit: 10, threshold: 0.3 });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("clusters");
    expect(response.total).toBeGreaterThanOrEqual(0);
    expect(response.clusters).toBeDefined();
  });

  it("handles empty knowledge graph", async () => {
    const result = await analyzeHandler({ operation: "clusters", limit: 10, threshold: 0.5 });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("clusters");
    expect(response.total).toBe(0);
    expect(response.clusters).toHaveLength(0);
  });

  it("respects threshold parameter", async () => {
    storage.createNode({
      content: "Topic clustering in knowledge graphs",
      type: "idea",
      tags: ["kg"],
    });
    storage.createNode({
      content: "Completely different topic about boats",
      type: "idea",
      tags: ["boats"],
    });

    const highThresholdResult = await analyzeHandler({ operation: "clusters", limit: 10, threshold: 0.8 });
    const highThresholdResponse = JSON.parse(highThresholdResult.content[0].text);

    const lowThresholdResult = await analyzeHandler({ operation: "clusters", limit: 10, threshold: 0.1 });
    const lowThresholdResponse = JSON.parse(lowThresholdResult.content[0].text);

    expect(highThresholdResponse.total).toBeLessThanOrEqual(lowThresholdResponse.total);
  });
});

describe("kg_analyze emerging operation", () => {
  let storage: FileStorage;
  let analyzeHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-emerging-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_analyze") analyzeHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("finds emerging concepts based on recent activity", async () => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    storage.createNode({
      content: "New clustering method",
      type: "idea",
      tags: ["clustering"],
      createdAt: new Date(oneDayAgo).toISOString(),
      updatedAt: new Date(oneDayAgo).toISOString(),
    });
    storage.createNode({
      content: "Clustering test results",
      type: "insight",
      tags: ["clustering"],
      createdAt: new Date(oneDayAgo + 1000).toISOString(),
      updatedAt: new Date(oneDayAgo + 1000).toISOString(),
    });

    storage.createNode({
      content: "Old boat design",
      type: "idea",
      tags: ["boats"],
      createdAt: new Date(tenDaysAgo).toISOString(),
      updatedAt: new Date(tenDaysAgo).toISOString(),
    });

    const result = await analyzeHandler({ operation: "emerging", limit: 10, windowDays: 7 });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("emerging");
    expect(response.total).toBeGreaterThan(0);
    expect(response.emerging).toBeDefined();

    const clusteringConcept = response.emerging.find((e: any) => e.tag === "clustering");
    expect(clusteringConcept).toBeDefined();
    expect(clusteringConcept.count).toBeGreaterThanOrEqual(2);
  });

  it("handles empty knowledge graph", async () => {
    const result = await analyzeHandler({ operation: "emerging", limit: 10, windowDays: 7 });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("emerging");
    expect(response.total).toBe(0);
    expect(response.emerging).toHaveLength(0);
  });

  it("respects window days parameter", async () => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    storage.createNode({
      content: "Recent concept",
      type: "idea",
      tags: ["recent"],
      createdAt: new Date(oneDayAgo).toISOString(),
      updatedAt: new Date(oneDayAgo).toISOString(),
    });

    storage.createNode({
      content: "Old concept",
      type: "idea",
      tags: ["old"],
      createdAt: new Date(tenDaysAgo).toISOString(),
      updatedAt: new Date(tenDaysAgo).toISOString(),
    });

    const shortWindowResult = await analyzeHandler({ operation: "emerging", limit: 10, windowDays: 2 });
    const shortWindowResponse = JSON.parse(shortWindowResult.content[0].text);

    const longWindowResult = await analyzeHandler({ operation: "emerging", limit: 10, windowDays: 15 });
    const longWindowResponse = JSON.parse(longWindowResult.content[0].text);

    expect(shortWindowResponse.total).toBeLessThanOrEqual(longWindowResponse.total);
  });
});

describe("kg_analyze path operation", () => {
  let storage: FileStorage;
  let analyzeHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-path-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_analyze") analyzeHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("finds direct connection between nodes", async () => {
    const nodeA = storage.createNode({
      content: "Node A",
      type: "idea",
      tags: ["test"],
    });
    const nodeB = storage.createNode({
      content: "Node B",
      type: "idea",
      tags: ["test"],
    });

    storage.createEdge(nodeA.id, nodeB.id, "references");

    const result = await analyzeHandler({ operation: "path", startId: nodeA.id, endId: nodeB.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("path");
    expect(response.found).toBe(true);
    expect(response.path).toHaveLength(2);
    expect(response.path[0]).toBe(nodeA.id);
    expect(response.path[1]).toBe(nodeB.id);
  });

  it("finds indirect connection through intermediate nodes", async () => {
    const nodeA = storage.createNode({
      content: "Node A",
      type: "idea",
      tags: ["test"],
    });
    const nodeB = storage.createNode({
      content: "Node B",
      type: "idea",
      tags: ["test"],
    });
    const nodeC = storage.createNode({
      content: "Node C",
      type: "idea",
      tags: ["test"],
    });

    storage.createEdge(nodeA.id, nodeB.id, "references");
    storage.createEdge(nodeB.id, nodeC.id, "relates_to");

    const result = await analyzeHandler({ operation: "path", startId: nodeA.id, endId: nodeC.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.found).toBe(true);
    expect(response.path).toHaveLength(3);
    expect(response.path[0]).toBe(nodeA.id);
    expect(response.path[1]).toBe(nodeB.id);
    expect(response.path[2]).toBe(nodeC.id);
  });

  it("returns no path when no connection exists", async () => {
    const nodeA = storage.createNode({
      content: "Node A",
      type: "idea",
      tags: ["test"],
    });
    const nodeB = storage.createNode({
      content: "Node B",
      type: "idea",
      tags: ["test"],
    });

    const result = await analyzeHandler({ operation: "path", startId: nodeA.id, endId: nodeB.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.found).toBe(false);
    expect(response.path).toHaveLength(0);
    expect(response.message).toBe("No path found");
  });

  it("respects max depth parameter", async () => {
    const nodeA = storage.createNode({
      content: "Node A",
      type: "idea",
      tags: ["test"],
    });
    const nodeB = storage.createNode({
      content: "Node B",
      type: "idea",
      tags: ["test"],
    });
    const nodeC = storage.createNode({
      content: "Node C",
      type: "idea",
      tags: ["test"],
    });

    storage.createEdge(nodeA.id, nodeB.id, "references");
    storage.createEdge(nodeB.id, nodeC.id, "relates_to");

    const result = await analyzeHandler({ operation: "path", startId: nodeA.id, endId: nodeC.id, maxDepth: 1 });
    const response = JSON.parse(result.content[0].text);

    expect(response.found).toBe(false);
    expect(response.path).toHaveLength(0);
  });

  it("handles missing required parameters", async () => {
    const result = await analyzeHandler({ operation: "path", startId: "some-id" });
    const response = JSON.parse(result.content[0].text);

    expect(response.error).toBeDefined();
  });
});

describe("kg_analyze graph_export operation", () => {
  let storage: FileStorage;
  let analyzeHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-graph-export-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_analyze") analyzeHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("exports empty knowledge graph structure", async () => {
    const result = await analyzeHandler({ operation: "graph_export" });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("graph_export");
    expect(response.metadata.totalNodes).toBe(0);
    expect(response.metadata.totalEdges).toBe(0);
    expect(response.metadata.exportedAt).toBeDefined();
    expect(response.metadata.version).toBe("2.0");
    expect(response.nodes).toHaveLength(0);
    expect(response.edges).toHaveLength(0);
  });

  it("exports populated knowledge graph structure", async () => {
    const node1 = storage.createNode({
      content: "Test node 1",
      type: "idea",
      tags: ["test"],
    });
    const node2 = storage.createNode({
      content: "Test node 2",
      type: "insight",
      tags: ["test"],
    });

    storage.createEdge(node1.id, node2.id, "references");

    const result = await analyzeHandler({ operation: "graph_export" });
    const response = JSON.parse(result.content[0].text);

    expect(response.metadata.totalNodes).toBe(2);
    expect(response.metadata.totalEdges).toBe(1);
    expect(response.nodes).toHaveLength(2);
    expect(response.edges).toHaveLength(1);

    const exportedNode1 = response.nodes.find((n: any) => n.id === node1.id);
    expect(exportedNode1).toBeDefined();
    expect(exportedNode1.type).toBe("idea");

    expect(response.edges[0].fromNodeId).toBe(node1.id);
    expect(response.edges[0].toNodeId).toBe(node2.id);
    expect(response.edges[0].relation).toBe("references");
  });

  it("includes all node properties", async () => {
    const node = storage.createNode({
      content: "Test node with all properties",
      type: "idea",
      tags: ["test", "complete"],
      visibility: "private",
      importance: "high",
      git: {
        repositoryPath: "/test/repo",
        currentBranch: "main",
        currentCommit: "abc123",
      },
    });

    const result = await analyzeHandler({ operation: "graph_export" });
    const response = JSON.parse(result.content[0].text);

    const exportedNode = response.nodes[0];
    expect(exportedNode.id).toBe(node.id);
    expect(exportedNode.type).toBe("idea");
    expect(exportedNode.content).toBe("Test node with all properties");
    expect(exportedNode.tags).toEqual(["test", "complete"]);
    expect(exportedNode.visibility).toBe("private");
    expect(exportedNode.importance).toBe("high");
    expect(exportedNode.git).toEqual({
      repositoryPath: "/test/repo",
      currentBranch: "main",
      currentCommit: "abc123",
    });
  });

  it("calculates accurate statistics", async () => {
    storage.createNode({ content: "Idea 1", type: "idea", tags: ["test"] });
    storage.createNode({ content: "Idea 2", type: "idea", tags: ["test"] });
    storage.createNode({ content: "Insight 1", type: "insight", tags: ["test"] });
    storage.createNode({ content: "Decision 1", type: "decision", tags: ["test"] });

    const nodes = storage.listAllNodes();
    storage.createEdge(nodes[0].id, nodes[1].id, "references");
    storage.createEdge(nodes[1].id, nodes[2].id, "relates_to");
    storage.createEdge(nodes[2].id, nodes[3].id, "derived_from");

    const result = await analyzeHandler({ operation: "graph_export" });
    const response = JSON.parse(result.content[0].text);

    expect(response.statistics.nodeTypes.idea).toBe(2);
    expect(response.statistics.nodeTypes.insight).toBe(1);
    expect(response.statistics.nodeTypes.decision).toBe(1);
    expect(response.statistics.relationTypes.references).toBe(1);
    expect(response.statistics.relationTypes.relates_to).toBe(1);
    expect(response.statistics.relationTypes.derived_from).toBe(1);
  });
});

describe("kg_analyze integration tests", () => {
  let storage: FileStorage;
  let analyzeHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-analysis-integration-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_analyze") analyzeHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("performs comprehensive analysis workflow", async () => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    const node1 = storage.createNode({
      content: "New clustering algorithm for knowledge graphs",
      type: "idea",
      tags: ["clustering", "kg"],
      createdAt: new Date(oneDayAgo).toISOString(),
      updatedAt: new Date(oneDayAgo).toISOString(),
    });
    const node2 = storage.createNode({
      content: "Clustering test results and evaluation",
      type: "insight",
      tags: ["clustering", "testing"],
      createdAt: new Date(oneDayAgo + 1000).toISOString(),
      updatedAt: new Date(oneDayAgo + 1000).toISOString(),
    });

    const node3 = storage.createNode({
      content: "Boat hull design principles",
      type: "idea",
      tags: ["boats", "hull"],
      createdAt: new Date(tenDaysAgo).toISOString(),
      updatedAt: new Date(tenDaysAgo).toISOString(),
    });

    storage.createEdge(node1.id, node2.id, "references");
    storage.createEdge(node2.id, node3.id, "relates_to");

    // 1. Detect topic clusters
    const clustersResult = await analyzeHandler({ operation: "clusters", limit: 10, threshold: 0.3 });
    const clustersResponse = JSON.parse(clustersResult.content[0].text);
    expect(clustersResponse.operation).toBe("clusters");

    // 2. Find emerging concepts
    const emergingResult = await analyzeHandler({ operation: "emerging", limit: 10, windowDays: 7 });
    const emergingResponse = JSON.parse(emergingResult.content[0].text);
    expect(emergingResponse.operation).toBe("emerging");

    // 3. Find connection path
    const pathResult = await analyzeHandler({ operation: "path", startId: node1.id, endId: node3.id });
    const pathResponse = JSON.parse(pathResult.content[0].text);
    expect(pathResponse.path).toHaveLength(3);

    // 4. Export graph structure
    const exportResult = await analyzeHandler({ operation: "graph_export" });
    const exportResponse = JSON.parse(exportResult.content[0].text);
    expect(exportResponse.metadata.totalNodes).toBe(3);
    expect(exportResponse.metadata.totalEdges).toBe(2);
  });
});
