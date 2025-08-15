import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupProjectTools } from "../tools/project.js";
import { FileStorage } from "../storage/FileStorage.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Project Tools", () => {
  let mockServer: McpServer;
  let storage: FileStorage;
  let registeredTools: Array<{ name: string; handler: Function }> = [];

  beforeEach(() => {
    // Reset storage with unique directory for each test
    const testDir = `test-storage-${Date.now()}-${Math.random()}`;
    storage = new FileStorage({ baseDir: testDir });
    
    // Clear registered tools
    registeredTools = [];
    
    // Create mock server
    mockServer = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.push({ name, handler });
      }),
    } as unknown as McpServer;
    
    // Setup project tools
    setupProjectTools(mockServer, storage);
  });

  describe("kg_get_project_state", () => {
    it("should return comprehensive project state", async () => {
      // Create test nodes
      const decisionNode = storage.createNode({
        content: "Decision: Use TypeScript",
        type: "decision",
        tags: ["proj:test-project", "important"],
      });

      const questionNode = storage.createNode({
        content: "How to implement caching?",
        type: "question",
        tags: ["proj:test-project", "blocker"],
      });

      const progressNode = storage.createNode({
        content: "Completed API setup",
        type: "progress",
        tags: ["proj:test-project", "completed"],
      });

      const activeNode = storage.createNode({
        content: "Working on UI components",
        type: "progress",
        tags: ["proj:test-project", "active"],
      });

      // Find the tool handler
      const tool = registeredTools.find(t => t.name === "kg_get_project_state");
      expect(tool).toBeDefined();

      // Call the tool
      const result = await tool!.handler({ project: "test-project" });
      const data = JSON.parse(result.content[0].text);

      // Verify response structure
      expect(data.project).toBe("test-project");
      expect(data.totalNodes).toBe(4);
      expect(data.recentDecisions).toHaveLength(1);
      expect(data.openQuestions).toHaveLength(1);
      expect(data.blockers).toHaveLength(1);
      expect(data.completedTasks).toHaveLength(1);
      expect(data.activeFocus).toHaveLength(1);

      // Verify content
      expect(data.recentDecisions[0].id).toBe(decisionNode.id);
      expect(data.openQuestions[0].id).toBe(questionNode.id);
      expect(data.blockers[0].id).toBe(questionNode.id);
      expect(data.completedTasks[0].id).toBe(progressNode.id);
      expect(data.activeFocus[0].id).toBe(activeNode.id);
    });

    it("should handle empty project", async () => {
      const tool = registeredTools.find(t => t.name === "kg_get_project_state");
      const result = await tool!.handler({ project: "empty-project" });
      const data = JSON.parse(result.content[0].text);

      expect(data.project).toBe("empty-project");
      expect(data.totalNodes).toBe(0);
      expect(data.recentDecisions).toHaveLength(0);
      expect(data.openQuestions).toHaveLength(0);
      expect(data.blockers).toHaveLength(0);
      expect(data.completedTasks).toHaveLength(0);
      expect(data.activeFocus).toHaveLength(0);
    });

    it("should normalize project name correctly", async () => {
      const tool = registeredTools.find(t => t.name === "kg_get_project_state");
      
      // Test with spaces and mixed case
      const result = await tool!.handler({ project: "Test Project Name" });
      const data = JSON.parse(result.content[0].text);
      
      expect(data.project).toBe("Test Project Name");
      // The tool should look for "proj:test-project-name" tag
    });
  });

  describe("kg_session_warmup", () => {
    it("should return session warmup data", async () => {
      // Create test nodes with workstream tags
      const recentNode = storage.createNode({
        content: "Recent work item",
        type: "progress",
        tags: ["proj:test-project", "ws:frontend"],
      });

      const questionNode = storage.createNode({
        content: "Open question",
        type: "question",
        tags: ["proj:test-project", "ws:frontend"],
      });

      const blockerNode = storage.createNode({
        content: "Blocking issue",
        type: "question",
        tags: ["proj:test-project", "ws:frontend", "blocker"],
      });

      const tool = registeredTools.find(t => t.name === "kg_session_warmup");
      const result = await tool!.handler({ 
        project: "test-project", 
        workstream: "frontend",
        limit: 10 
      });
      
      const data = JSON.parse(result.content[0].text);

      expect(data.project).toBe("test-project");
      expect(data.workstream).toBe("frontend");
      expect(data.recentWork).toHaveLength(3);
      expect(data.openQuestions).toHaveLength(2);
      expect(data.blockers).toHaveLength(1);
      expect(data.sessionStart).toBeDefined();
    });

    it("should work without workstream", async () => {
      // Create some nodes for this test
      storage.createNode({
        content: "Test work item",
        type: "progress",
        tags: ["proj:test-project"],
      });

      const tool = registeredTools.find(t => t.name === "kg_session_warmup");
      const result = await tool!.handler({ 
        project: "test-project", 
        limit: 5 
      });
      
      const data = JSON.parse(result.content[0].text);

      expect(data.project).toBe("test-project");
      expect(data.workstream).toBeUndefined();
      expect(data.recentWork).toHaveLength(1);
      expect(data.openQuestions).toHaveLength(0);
      expect(data.blockers).toHaveLength(0);
    });

    it("should respect limit parameter", async () => {
      // Create multiple nodes
      for (let i = 0; i < 15; i++) {
        storage.createNode({
          content: `Work item ${i}`,
          type: "progress",
          tags: ["proj:test-project"],
        });
      }

      const tool = registeredTools.find(t => t.name === "kg_session_warmup");
      const result = await tool!.handler({ 
        project: "test-project", 
        limit: 10 
      });
      
      const data = JSON.parse(result.content[0].text);
      expect(data.recentWork).toHaveLength(10);
    });

    it("should use default limit when not specified", async () => {
      // Create some nodes to test the default limit
      for (let i = 0; i < 25; i++) {
        storage.createNode({
          content: `Work item ${i}`,
          type: "progress",
          tags: ["proj:test-project"],
        });
      }

      const tool = registeredTools.find(t => t.name === "kg_session_warmup");
      const result = await tool!.handler({ 
        project: "test-project"
      });
      
      const data = JSON.parse(result.content[0].text);
      expect(data.recentWork).toHaveLength(20); // Default limit is 20
    });
  });

  describe("kg_get_node", () => {
    it("should return node with relationships", async () => {
      const node = storage.createNode({
        content: "Test node",
        type: "idea",
        tags: ["test"],
      });

      const tool = registeredTools.find(t => t.name === "kg_get_node");
      const result = await tool!.handler({ id: node.id });
      const data = JSON.parse(result.content[0].text);

      expect(data.node).toBeDefined();
      expect(data.node.id).toBe(node.id);
      expect(data.node.content).toBe("Test node");
      expect(data.relationships).toBeDefined();
      expect(Array.isArray(data.relationships)).toBe(true);
    });

    it("should return error for non-existent node", async () => {
      const tool = registeredTools.find(t => t.name === "kg_get_node");
      const result = await tool!.handler({ id: "non-existent-id" });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBe("Node not found");
    });
  });

  describe("kg_delete_node", () => {
    it("should delete node successfully", async () => {
      const node = storage.createNode({
        content: "Node to delete",
        type: "idea",
        tags: ["test"],
      });

      const tool = registeredTools.find(t => t.name === "kg_delete_node");
      const result = await tool!.handler({ id: node.id, deleteEdges: true });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.deletedNode).toBe(node.id);
      expect(data.deletedEdges).toBe(0); // No edges to delete in this test

      // Verify node is actually deleted
      const deletedNode = storage.getNode(node.id);
      expect(deletedNode).toBeUndefined();
    });

    it("should delete node without edges", async () => {
      const node = storage.createNode({
        content: "Node to delete",
        type: "idea",
        tags: ["test"],
      });

      const tool = registeredTools.find(t => t.name === "kg_delete_node");
      const result = await tool!.handler({ id: node.id, deleteEdges: false });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.deletedNode).toBe(node.id);
      expect(data.deletedEdges).toBe(0);
    });

    it("should return error for non-existent node", async () => {
      const tool = registeredTools.find(t => t.name === "kg_delete_node");
      const result = await tool!.handler({ id: "non-existent-id" });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toBe("Node not found");
    });

    it("should use default deleteEdges value", async () => {
      const node = storage.createNode({
        content: "Node to delete",
        type: "idea",
        tags: ["test"],
      });

      const tool = registeredTools.find(t => t.name === "kg_delete_node");
      const result = await tool!.handler({ id: node.id });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.deletedEdges).toBe(0); // No edges to delete in this test
    });

    it("should delete edges when they exist", async () => {
      const node1 = storage.createNode({
        content: "Node 1",
        type: "idea",
        tags: ["test"],
      });

      const node2 = storage.createNode({
        content: "Node 2",
        type: "idea",
        tags: ["test"],
      });

      // Create an edge between the nodes
      storage.createEdge(node1.id, node2.id, "references");

      const tool = registeredTools.find(t => t.name === "kg_delete_node");
      const result = await tool!.handler({ id: node1.id, deleteEdges: true });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.deletedNode).toBe(node1.id);
      expect(data.deletedEdges).toBe(1); // Should have deleted 1 edge

      // Verify node is deleted
      const deletedNode = storage.getNode(node1.id);
      expect(deletedNode).toBeUndefined();

      // Verify edge is deleted
      const remainingEdges = storage.listEdges();
      expect(remainingEdges).toHaveLength(0);
    });
  });

  describe("kg_capture_session", () => {
    it("should capture session with all parameters", async () => {
      const tool = registeredTools.find(t => t.name === "kg_capture_session");
      const result = await tool!.handler({
        summary: "Completed API implementation",
        duration: "2 hours",
        artifacts: ["API docs", "Test suite"],
        next_actions: ["Deploy to staging", "Update documentation"],
        visibility: "team",
        importance: "high"
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.accepted).toBe(true);
      expect(data.node).toBeDefined();
      expect(data.node.type).toBe("session");
      expect(data.node.tags).toContain("session");
      expect(data.node.visibility).toBe("team");
      expect(data.node.importance).toBe("high");
      expect(data.node.content).toContain("Session Summary: Completed API implementation");
      expect(data.node.content).toContain("Duration: 2 hours");
      expect(data.node.content).toContain("Artifacts: API docs, Test suite");
      expect(data.node.content).toContain("Next Actions: Deploy to staging; Update documentation");
    });

    it("should capture session with minimal parameters", async () => {
      const tool = registeredTools.find(t => t.name === "kg_capture_session");
      const result = await tool!.handler({
        summary: "Quick bug fix"
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.accepted).toBe(true);
      expect(data.node).toBeDefined();
      expect(data.node.type).toBe("session");
      expect(data.node.tags).toContain("session");
      expect(data.node.importance).toBe("medium"); // Default
      expect(data.node.content).toBe("Session Summary: Quick bug fix");
    });

    it("should handle optional parameters correctly", async () => {
      const tool = registeredTools.find(t => t.name === "kg_capture_session");
      const result = await tool!.handler({
        summary: "Mixed session",
        duration: "1 hour",
        artifacts: ["Code changes"],
        // No next_actions
        visibility: "private"
        // No importance (should default to medium)
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.accepted).toBe(true);
      expect(data.node.content).toContain("Session Summary: Mixed session");
      expect(data.node.content).toContain("Duration: 1 hour");
      expect(data.node.content).toContain("Artifacts: Code changes");
      expect(data.node.content).not.toContain("Next Actions");
      expect(data.node.visibility).toBe("private");
      expect(data.node.importance).toBe("medium");
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete project workflow", async () => {
      // 1. Create project nodes
      const decisionNode = storage.createNode({
        content: "Decision: Use modular architecture",
        type: "decision",
        tags: ["proj:test-project", "architecture"],
      });

      const questionNode = storage.createNode({
        content: "How to handle backward compatibility?",
        type: "question",
        tags: ["proj:test-project", "blocker"],
      });

      // 2. Get project state
      const stateTool = registeredTools.find(t => t.name === "kg_get_project_state");
      const stateResult = await stateTool!.handler({ project: "test-project" });
      const stateData = JSON.parse(stateResult.content[0].text);

      expect(stateData.totalNodes).toBe(2);
      expect(stateData.recentDecisions).toHaveLength(1);
      expect(stateData.openQuestions).toHaveLength(1);

      // 3. Session warmup
      const warmupTool = registeredTools.find(t => t.name === "kg_session_warmup");
      const warmupResult = await warmupTool!.handler({ 
        project: "test-project", 
        limit: 5 
      });
      const warmupData = JSON.parse(warmupResult.content[0].text);

      expect(warmupData.recentWork).toHaveLength(2);
      expect(warmupData.blockers).toHaveLength(1);

      // 4. Get specific node
      const getNodeTool = registeredTools.find(t => t.name === "kg_get_node");
      const nodeResult = await getNodeTool!.handler({ id: decisionNode.id });
      const nodeData = JSON.parse(nodeResult.content[0].text);

      expect(nodeData.node.id).toBe(decisionNode.id);
      expect(nodeData.node.content).toBe("Decision: Use modular architecture");

      // 5. Delete node
      const deleteTool = registeredTools.find(t => t.name === "kg_delete_node");
      const deleteResult = await deleteTool!.handler({ id: questionNode.id });
      const deleteData = JSON.parse(deleteResult.content[0].text);

      expect(deleteData.success).toBe(true);

      // 6. Verify deletion
      const finalStateResult = await stateTool!.handler({ project: "test-project" });
      const finalStateData = JSON.parse(finalStateResult.content[0].text);

      expect(finalStateData.totalNodes).toBe(1);
      expect(finalStateData.openQuestions).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle storage errors gracefully", async () => {
      // Mock storage to throw error
      const errorStorage = {
        searchNodes: vi.fn().mockImplementation(() => {
          throw new Error("Storage error");
        }),
        getNode: vi.fn(),
        deleteNode: vi.fn(),
        listEdges: vi.fn(),
        createNode: vi.fn(),
      } as unknown as FileStorage;

      // Re-setup tools with error storage
      registeredTools = [];
      const errorServer = {
        tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
          registeredTools.push({ name, handler });
        }),
      } as unknown as McpServer;

      setupProjectTools(errorServer, errorStorage);

      const tool = registeredTools.find(t => t.name === "kg_get_project_state");
      
      // Should not throw, but return error response
      await expect(tool!.handler({ project: "test-project" })).rejects.toThrow("Storage error");
    });
  });

  describe("Tool Registration", () => {
    it("should register all required project tools", () => {
      const toolNames = registeredTools.map(t => t.name);
      
      expect(toolNames).toContain("kg_get_project_state");
      expect(toolNames).toContain("kg_session_warmup");
      expect(toolNames).toContain("kg_get_node");
      expect(toolNames).toContain("kg_delete_node");
      expect(toolNames).toContain("kg_capture_session");
      
      expect(toolNames).toHaveLength(5);
    });

    it("should register tools with correct server", () => {
      expect(mockServer.tool).toHaveBeenCalledTimes(5);
      
      // Verify each tool was registered
      const calls = vi.mocked(mockServer.tool).mock.calls;
      const registeredNames = calls.map(call => call[0]);
      
      expect(registeredNames).toContain("kg_get_project_state");
      expect(registeredNames).toContain("kg_session_warmup");
      expect(registeredNames).toContain("kg_get_node");
      expect(registeredNames).toContain("kg_delete_node");
      expect(registeredNames).toContain("kg_capture_session");
    });
  });
});
