import { describe, it, expect, beforeEach } from "vitest";
import { setupRelationshipTools } from "../tools/relationships.js";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("relationships tools registration", () => {
  it("registers kg_create_edge and kg_list_edges", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-rel-tools-"));
    const storage = new FileStorage({ baseDir });

    const registered: string[] = [];
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, _handler: unknown) => {
        registered.push(name);
      },
    } as unknown as Parameters<typeof setupRelationshipTools>[0];

    setupRelationshipTools(mockServer, storage);

    expect(registered).toContain("kg_create_edge");
    expect(registered).toContain("kg_list_edges");
    // Maintenance tool is also part of relationships module today
    expect(registered).toContain("kg_relationships_maintenance");
  });
});

describe("kg_create_edge functional tests", () => {
  let storage: FileStorage;
  let mockServer: any;
  let createEdgeHandler: any;
  let listEdgesHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-rel-create-"));
    storage = new FileStorage({ baseDir });
    
    mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_create_edge") createEdgeHandler = handler;
        if (name === "kg_list_edges") listEdgesHandler = handler;
      },
    } as unknown as Parameters<typeof setupRelationshipTools>[0];

    setupRelationshipTools(mockServer, storage);
  });

  it("creates edge with all relation types", async () => {
    const nodeA = storage.createNode({
      content: "Test node A",
      type: "idea",
      tags: ["test"],
    });
    const nodeB = storage.createNode({
      content: "Test node B", 
      type: "insight",
      tags: ["test"],
    });

    const relations = ["references", "relates_to", "derived_from", "blocks", "duplicates"] as const;
    
    for (const relation of relations) {
      const result = await createEdgeHandler({ 
        fromNodeId: nodeA.id, 
        toNodeId: nodeB.id, 
        relation 
      });
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.edge.fromNodeId).toBe(nodeA.id);
      expect(response.edge.toNodeId).toBe(nodeB.id);
      expect(response.edge.relation).toBe(relation);
      expect(response.edge.strength).toBeDefined();
      expect(typeof response.edge.strength).toBe("number");
    }
  });

  it("returns error when nodes don't exist", async () => {
    const result = await createEdgeHandler({
      fromNodeId: "non-existent-id",
      toNodeId: "another-non-existent-id", 
      relation: "references"
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBe("One or both nodes not found");
  });

  it("returns error when fromNode doesn't exist", async () => {
    const nodeB = storage.createNode({
      content: "Test node B",
      type: "idea",
      tags: ["test"],
    });

    const result = await createEdgeHandler({
      fromNodeId: "non-existent-id",
      toNodeId: nodeB.id,
      relation: "references"
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBe("One or both nodes not found");
  });

  it("returns error when toNode doesn't exist", async () => {
    const nodeA = storage.createNode({
      content: "Test node A",
      type: "idea", 
      tags: ["test"],
    });

    const result = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: "non-existent-id",
      relation: "references"
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBe("One or both nodes not found");
  });

  it("creates edge with strength based on content similarity", async () => {
    const nodeA = storage.createNode({
      content: "Git integration and commit capture",
      type: "idea",
      tags: ["git"],
    });
    const nodeB = storage.createNode({
      content: "Capture git branch and commit for nodes",
      type: "insight", 
      tags: ["git"],
    });
    const nodeC = storage.createNode({
      content: "Sailboat hull type vocabulary",
      type: "idea",
      tags: ["boats"],
    });

    const resultAB = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: nodeB.id,
      relation: "references"
    });
    const resultAC = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: nodeC.id,
      relation: "references"
    });

    const edgeAB = JSON.parse(resultAB.content[0].text).edge;
    const edgeAC = JSON.parse(resultAC.content[0].text).edge;

    // Similar content should have higher strength
    expect(edgeAB.strength).toBeGreaterThan(edgeAC.strength);
  });
});

describe("kg_list_edges functional tests", () => {
  let storage: FileStorage;
  let listEdgesHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-rel-list-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_list_edges") listEdgesHandler = handler;
      },
    } as unknown as Parameters<typeof setupRelationshipTools>[0];

    setupRelationshipTools(mockServer, storage);
  });

  it("lists all edges when no nodeId provided", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });
    const nodeB = storage.createNode({ content: "Node B", type: "idea", tags: ["test"] });
    const nodeC = storage.createNode({ content: "Node C", type: "idea", tags: ["test"] });

    storage.createEdge(nodeA.id, nodeB.id, "references");
    storage.createEdge(nodeB.id, nodeC.id, "relates_to");

    const result = await listEdgesHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBe(2);
    expect(response.edges).toHaveLength(2);
    expect(response.edges.some((e: any) => e.fromNodeId === nodeA.id && e.toNodeId === nodeB.id)).toBe(true);
    expect(response.edges.some((e: any) => e.fromNodeId === nodeB.id && e.toNodeId === nodeC.id)).toBe(true);
  });

  it("filters edges by nodeId (fromNodeId)", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });
    const nodeB = storage.createNode({ content: "Node B", type: "idea", tags: ["test"] });
    const nodeC = storage.createNode({ content: "Node C", type: "idea", tags: ["test"] });

    storage.createEdge(nodeA.id, nodeB.id, "references");
    storage.createEdge(nodeB.id, nodeC.id, "relates_to");

    const result = await listEdgesHandler({ nodeId: nodeA.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBe(1);
    expect(response.edges).toHaveLength(1);
    expect(response.edges[0].fromNodeId).toBe(nodeA.id);
    expect(response.edges[0].toNodeId).toBe(nodeB.id);
  });

  it("filters edges by nodeId (toNodeId)", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });
    const nodeB = storage.createNode({ content: "Node B", type: "idea", tags: ["test"] });
    const nodeC = storage.createNode({ content: "Node C", type: "idea", tags: ["test"] });

    storage.createEdge(nodeA.id, nodeB.id, "references");
    storage.createEdge(nodeB.id, nodeC.id, "relates_to");

    const result = await listEdgesHandler({ nodeId: nodeB.id });
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBe(2);
    expect(response.edges).toHaveLength(2);
    expect(response.edges.some((e: any) => e.fromNodeId === nodeA.id && e.toNodeId === nodeB.id)).toBe(true);
    expect(response.edges.some((e: any) => e.fromNodeId === nodeB.id && e.toNodeId === nodeC.id)).toBe(true);
  });

  it("returns empty list for non-existent nodeId", async () => {
    const result = await listEdgesHandler({ nodeId: "non-existent-id" });
    const response = JSON.parse(result.content[0].text);

    expect(response.total).toBe(0);
    expect(response.edges).toHaveLength(0);
  });
});

describe("relationships integration tests", () => {
  let storage: FileStorage;
  let createEdgeHandler: any;
  let listEdgesHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-rel-integration-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_create_edge") createEdgeHandler = handler;
        if (name === "kg_list_edges") listEdgesHandler = handler;
      },
    } as unknown as Parameters<typeof setupRelationshipTools>[0];

    setupRelationshipTools(mockServer, storage);
  });

  it("creates and retrieves edges via storage round-trip", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });
    const nodeB = storage.createNode({ content: "Node B", type: "idea", tags: ["test"] });

    // Create edge via tool
    const createResult = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: nodeB.id,
      relation: "references"
    });
    const createdEdge = JSON.parse(createResult.content[0].text).edge;

    // Verify edge exists in storage
    const listResult = await listEdgesHandler({});
    const allEdges = JSON.parse(listResult.content[0].text).edges;
    
    expect(allEdges).toHaveLength(1);
    expect(allEdges[0].id).toBe(createdEdge.id);
    expect(allEdges[0].fromNodeId).toBe(nodeA.id);
    expect(allEdges[0].toNodeId).toBe(nodeB.id);
    expect(allEdges[0].relation).toBe("references");
  });

  it("maintains edge direction correctly", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });
    const nodeB = storage.createNode({ content: "Node B", type: "idea", tags: ["test"] });

    await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: nodeB.id,
      relation: "blocks"
    });

    const result = await listEdgesHandler({ nodeId: nodeA.id });
    const edges = JSON.parse(result.content[0].text).edges;

    expect(edges).toHaveLength(1);
    expect(edges[0].fromNodeId).toBe(nodeA.id);
    expect(edges[0].toNodeId).toBe(nodeB.id);
    expect(edges[0].relation).toBe("blocks");
  });
});

describe("relationships data integrity tests", () => {
  let storage: FileStorage;
  let createEdgeHandler: any;
  let listEdgesHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-rel-integrity-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_create_edge") createEdgeHandler = handler;
        if (name === "kg_list_edges") listEdgesHandler = handler;
      },
    } as unknown as Parameters<typeof setupRelationshipTools>[0];

    setupRelationshipTools(mockServer, storage);
  });

  it("allows multiple edges between same nodes with different relations", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });
    const nodeB = storage.createNode({ content: "Node B", type: "idea", tags: ["test"] });

    const edge1 = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: nodeB.id,
      relation: "references"
    });
    const edge2 = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: nodeB.id,
      relation: "relates_to"
    });

    const edge1Data = JSON.parse(edge1.content[0].text).edge;
    const edge2Data = JSON.parse(edge2.content[0].text).edge;

    expect(edge1Data.id).not.toBe(edge2Data.id);
    expect(edge1Data.relation).toBe("references");
    expect(edge2Data.relation).toBe("relates_to");

    const allEdges = JSON.parse((await listEdgesHandler({})).content[0].text).edges;
    expect(allEdges).toHaveLength(2);
  });

  it("allows bidirectional edges between nodes", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });
    const nodeB = storage.createNode({ content: "Node B", type: "idea", tags: ["test"] });

    const edgeAB = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: nodeB.id,
      relation: "references"
    });
    const edgeBA = await createEdgeHandler({
      fromNodeId: nodeB.id,
      toNodeId: nodeA.id,
      relation: "relates_to"
    });

    const edgeABData = JSON.parse(edgeAB.content[0].text).edge;
    const edgeBAData = JSON.parse(edgeBA.content[0].text).edge;

    expect(edgeABData.id).not.toBe(edgeBAData.id);
    expect(edgeABData.fromNodeId).toBe(nodeA.id);
    expect(edgeABData.toNodeId).toBe(nodeB.id);
    expect(edgeBAData.fromNodeId).toBe(nodeB.id);
    expect(edgeBAData.toNodeId).toBe(nodeA.id);

    const allEdges = JSON.parse((await listEdgesHandler({})).content[0].text).edges;
    expect(allEdges).toHaveLength(2);
  });

  it("validates node existence before creating edges", async () => {
    const nodeA = storage.createNode({ content: "Node A", type: "idea", tags: ["test"] });

    // Try to create edge with non-existent toNode
    const result = await createEdgeHandler({
      fromNodeId: nodeA.id,
      toNodeId: "non-existent-id",
      relation: "references"
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBe("One or both nodes not found");

    // Verify no edge was created
    const allEdges = JSON.parse((await listEdgesHandler({})).content[0].text).edges;
    expect(allEdges).toHaveLength(0);
  });
});


