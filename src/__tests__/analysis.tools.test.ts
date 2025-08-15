import { describe, it, expect, beforeEach } from "vitest";
import { setupAnalysisTools } from "../tools/analysis.js";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("analysis tools registration", () => {
  it("registers all analysis tools", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-analysis-tools-"));
    const storage = new FileStorage({ baseDir });

    const registered: string[] = [];
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, _handler: unknown) => {
        registered.push(name);
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);

    expect(registered).toContain("kg_detect_topic_clusters");
    expect(registered).toContain("kg_find_emerging_concepts");
    expect(registered).toContain("kg_find_connection_path");
    expect(registered).toContain("kg_graph_export");
  });
});

describe("kg_detect_topic_clusters functional tests", () => {
  let storage: FileStorage;
  let detectClustersHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-clusters-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_detect_topic_clusters") detectClustersHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("detects clusters in related content", async () => {
    // Create nodes with related content
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

    const result = await detectClustersHandler({ limit: 10, threshold: 0.3 });
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBeGreaterThan(0);
    expect(response.clusters).toBeDefined();
    expect(response.clusters.length).toBeGreaterThan(0);
  });

  it("handles empty knowledge graph", async () => {
    const result = await detectClustersHandler({ limit: 10, threshold: 0.5 });
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBe(0);
    expect(response.clusters).toHaveLength(0);
  });

  it("respects limit parameter", async () => {
    // Create many nodes
    for (let i = 0; i < 20; i++) {
      storage.createNode({
        content: `Test node ${i}`,
        type: "idea",
        tags: ["test"],
      });
    }

    const result = await detectClustersHandler({ limit: 5, threshold: 0.5 });
    const response = JSON.parse(result.content[0].text);

    // Should respect the limit
    expect(response.clusters.length).toBeLessThanOrEqual(5);
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

    // High threshold should result in fewer clusters
    const highThresholdResult = await detectClustersHandler({ limit: 10, threshold: 0.8 });
    const highThresholdResponse = JSON.parse(highThresholdResult.content[0].text);

    // Low threshold should result in more clusters
    const lowThresholdResult = await detectClustersHandler({ limit: 10, threshold: 0.1 });
    const lowThresholdResponse = JSON.parse(lowThresholdResult.content[0].text);

    expect(highThresholdResponse.total).toBeLessThanOrEqual(lowThresholdResponse.total);
  });
});

describe("kg_find_emerging_concepts functional tests", () => {
  let storage: FileStorage;
  let findEmergingHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-emerging-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_find_emerging_concepts") findEmergingHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("finds emerging concepts based on recent activity", async () => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    // Recent nodes with clustering tag
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

    // Old node with boats tag
    storage.createNode({
      content: "Old boat design",
      type: "idea",
      tags: ["boats"],
      createdAt: new Date(tenDaysAgo).toISOString(),
      updatedAt: new Date(tenDaysAgo).toISOString(),
    });

    const result = await findEmergingHandler({ limit: 10, windowDays: 7 });
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBeGreaterThan(0);
    expect(response.emerging).toBeDefined();
    expect(response.emerging.length).toBeGreaterThan(0);
    
    // Should find clustering as emerging concept
    const clusteringConcept = response.emerging.find((e: any) => e.tag === "clustering");
    expect(clusteringConcept).toBeDefined();
    expect(clusteringConcept.count).toBeGreaterThanOrEqual(2);
  });

  it("handles empty knowledge graph", async () => {
    const result = await findEmergingHandler({ limit: 10, windowDays: 7 });
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBe(0);
    expect(response.emerging).toHaveLength(0);
  });

  it("respects window days parameter", async () => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    // Recent node
    storage.createNode({
      content: "Recent concept",
      type: "idea",
      tags: ["recent"],
      createdAt: new Date(oneDayAgo).toISOString(),
      updatedAt: new Date(oneDayAgo).toISOString(),
    });

    // Old node
    storage.createNode({
      content: "Old concept",
      type: "idea",
      tags: ["old"],
      createdAt: new Date(tenDaysAgo).toISOString(),
      updatedAt: new Date(tenDaysAgo).toISOString(),
    });

    // Short window should only find recent concepts
    const shortWindowResult = await findEmergingHandler({ limit: 10, windowDays: 2 });
    const shortWindowResponse = JSON.parse(shortWindowResult.content[0].text);

    // Long window should find both concepts
    const longWindowResult = await findEmergingHandler({ limit: 10, windowDays: 15 });
    const longWindowResponse = JSON.parse(longWindowResult.content[0].text);

    expect(shortWindowResponse.total).toBeLessThanOrEqual(longWindowResponse.total);
  });
});

describe("kg_find_connection_path functional tests", () => {
  let storage: FileStorage;
  let findPathHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-path-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_find_connection_path") findPathHandler = handler;
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

    const result = await findPathHandler({ startId: nodeA.id, endId: nodeB.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.path).toHaveLength(2);
    expect(response.path[0]).toBe(nodeA.id);
    expect(response.path[1]).toBe(nodeB.id);
    expect(response.length).toBe(2);
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

    const result = await findPathHandler({ startId: nodeA.id, endId: nodeC.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.path).toHaveLength(3);
    expect(response.path[0]).toBe(nodeA.id);
    expect(response.path[1]).toBe(nodeB.id);
    expect(response.path[2]).toBe(nodeC.id);
    expect(response.length).toBe(3);
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

    const result = await findPathHandler({ startId: nodeA.id, endId: nodeB.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.path).toHaveLength(0);
    expect(response.length).toBe(0);
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

    // Max depth of 1 should not find path to node C
    const result = await findPathHandler({ startId: nodeA.id, endId: nodeC.id, maxDepth: 1 });
    const response = JSON.parse(result.content[0].text);

    expect(response.path).toHaveLength(0);
    expect(response.length).toBe(0);
  });

  it("handles non-existent nodes", async () => {
    const nodeA = storage.createNode({
      content: "Node A",
      type: "idea",
      tags: ["test"],
    });

    const result = await findPathHandler({ startId: nodeA.id, endId: "non-existent-id" });
    const response = JSON.parse(result.content[0].text);

    expect(response.path).toHaveLength(0);
    expect(response.length).toBe(0);
  });
});

describe("kg_graph_export functional tests", () => {
  let storage: FileStorage;
  let graphExportHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-graph-export-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_graph_export") graphExportHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("exports empty knowledge graph structure", async () => {
    const result = await graphExportHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.metadata.totalNodes).toBe(0);
    expect(response.metadata.totalEdges).toBe(0);
    expect(response.metadata.exportedAt).toBeDefined();
    expect(response.metadata.version).toBe("2.0");
    expect(response.nodes).toHaveLength(0);
    expect(response.edges).toHaveLength(0);
    expect(response.statistics.nodeTypes).toEqual({});
    expect(response.statistics.relationTypes).toEqual({});
    expect(response.statistics.averageStrength).toBe(0);
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

    const result = await graphExportHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.metadata.totalNodes).toBe(2);
    expect(response.metadata.totalEdges).toBe(1);
    expect(response.nodes).toHaveLength(2);
    expect(response.edges).toHaveLength(1);
    
    // Check node data
    const exportedNode1 = response.nodes.find((n: any) => n.id === node1.id);
    const exportedNode2 = response.nodes.find((n: any) => n.id === node2.id);
    expect(exportedNode1).toBeDefined();
    expect(exportedNode2).toBeDefined();
    expect(exportedNode1.type).toBe("idea");
    expect(exportedNode2.type).toBe("insight");
    
    // Check edge data
    expect(response.edges[0].fromNodeId).toBe(node1.id);
    expect(response.edges[0].toNodeId).toBe(node2.id);
    expect(response.edges[0].relation).toBe("references");
    
    // Check statistics
    expect(response.statistics.nodeTypes.idea).toBe(1);
    expect(response.statistics.nodeTypes.insight).toBe(1);
    expect(response.statistics.relationTypes.references).toBe(1);
    expect(response.statistics.averageStrength).toBeGreaterThanOrEqual(0);
  });

  it("includes all node and edge properties", async () => {
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

    const result = await graphExportHandler({});
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
    expect(exportedNode.createdAt).toBeDefined();
    expect(exportedNode.updatedAt).toBeDefined();
  });

  it("calculates accurate statistics", async () => {
    // Create nodes of different types
    storage.createNode({ content: "Idea 1", type: "idea", tags: ["test"] });
    storage.createNode({ content: "Idea 2", type: "idea", tags: ["test"] });
    storage.createNode({ content: "Insight 1", type: "insight", tags: ["test"] });
    storage.createNode({ content: "Decision 1", type: "decision", tags: ["test"] });

    // Create edges of different types
    const nodes = storage.listAllNodes();
    storage.createEdge(nodes[0].id, nodes[1].id, "references");
    storage.createEdge(nodes[1].id, nodes[2].id, "relates_to");
    storage.createEdge(nodes[2].id, nodes[3].id, "derived_from");

    const result = await graphExportHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.statistics.nodeTypes.idea).toBe(2);
    expect(response.statistics.nodeTypes.insight).toBe(1);
    expect(response.statistics.nodeTypes.decision).toBe(1);
    expect(response.statistics.relationTypes.references).toBe(1);
    expect(response.statistics.relationTypes.relates_to).toBe(1);
    expect(response.statistics.relationTypes.derived_from).toBe(1);
    expect(response.statistics.averageStrength).toBeGreaterThanOrEqual(0);
  });
});

describe("analysis tools integration tests", () => {
  let storage: FileStorage;
  let detectClustersHandler: any;
  let findEmergingHandler: any;
  let findPathHandler: any;
  let graphExportHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-analysis-integration-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_detect_topic_clusters") detectClustersHandler = handler;
        if (name === "kg_find_emerging_concepts") findEmergingHandler = handler;
        if (name === "kg_find_connection_path") findPathHandler = handler;
        if (name === "kg_graph_export") graphExportHandler = handler;
      },
    } as unknown as Parameters<typeof setupAnalysisTools>[0];

    setupAnalysisTools(mockServer, storage);
  });

  it("performs comprehensive analysis workflow", async () => {
    // Create a complex knowledge graph
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    // Recent clustering-related nodes
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

    // Old boat-related nodes
    const node3 = storage.createNode({
      content: "Boat hull design principles",
      type: "idea",
      tags: ["boats", "hull"],
      createdAt: new Date(tenDaysAgo).toISOString(),
      updatedAt: new Date(tenDaysAgo).toISOString(),
    });

    // Create relationships
    storage.createEdge(node1.id, node2.id, "references");
    storage.createEdge(node2.id, node3.id, "relates_to");

    // 1. Detect topic clusters
    const clustersResult = await detectClustersHandler({ limit: 10, threshold: 0.3 });
    const clustersResponse = JSON.parse(clustersResult.content[0].text);
    expect(clustersResponse.total).toBeGreaterThan(0);

    // 2. Find emerging concepts
    const emergingResult = await findEmergingHandler({ limit: 10, windowDays: 7 });
    const emergingResponse = JSON.parse(emergingResult.content[0].text);
    expect(emergingResponse.total).toBeGreaterThan(0);

    // 3. Find connection path
    const pathResult = await findPathHandler({ startId: node1.id, endId: node3.id });
    const pathResponse = JSON.parse(pathResult.content[0].text);
    expect(pathResponse.path).toHaveLength(3);

    // 4. Export graph structure
    const exportResult = await graphExportHandler({});
    const exportResponse = JSON.parse(exportResult.content[0].text);
    expect(exportResponse.metadata.totalNodes).toBe(3);
    expect(exportResponse.metadata.totalEdges).toBe(2);
    expect(exportResponse.statistics.nodeTypes.idea).toBe(2);
    expect(exportResponse.statistics.nodeTypes.insight).toBe(1);
  });
});
