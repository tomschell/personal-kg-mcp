import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FileStorage } from "../storage/FileStorage.js";
import { setupDiagnosticTools } from "../tools/diagnostic.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("kg_diagnostic tool", () => {
  let server: McpServer;
  let storage: FileStorage;
  let testDir: string;
  let toolHandler: (args: any) => Promise<any>;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "kg-diagnostic-test-"));
    storage = new FileStorage({ baseDir: testDir });

    // Create some test nodes
    storage.createNode({
      content: "Decision to use OpenAI embeddings for semantic search",
      type: "decision",
      tags: ["proj:test", "embedding"],
      visibility: "private",
      importance: "high"
    });

    storage.createNode({
      content: "Progress on implementing the search feature",
      type: "progress",
      tags: ["proj:test", "search"],
      visibility: "private",
      importance: "medium"
    });

    storage.createNode({
      content: "Question: Should we use vector database?",
      type: "question",
      tags: ["proj:test", "architecture"],
      visibility: "private",
      importance: "medium"
    });

    // Capture the tool handler
    server = {
      tool: (_name: string, _desc: string, _schema: any, handler: any) => {
        toolHandler = handler;
      }
    } as any;

    setupDiagnosticTools(server, storage);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("generates diagnostic HTML with all nodes", async () => {
    const result = await toolHandler({ open_browser: false });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.metadata.totalNodes).toBe(3);
    expect(response.outputPath).toContain("diagnostic.html");

    // Verify HTML file was created
    expect(fs.existsSync(response.outputPath)).toBe(true);

    // Verify HTML content
    const html = fs.readFileSync(response.outputPath, "utf-8");
    expect(html).toContain("PKG Diagnostic Dashboard");
    expect(html).toContain("Node Browser");
    expect(html).toContain("Search Debugger");
    expect(html).toContain("Context Debugger");
  });

  it("includes context simulation data", async () => {
    const result = await toolHandler({ open_browser: false });
    const response = JSON.parse(result.content[0].text);

    expect(response.contextSimulation).toBeDefined();
    expect(response.contextSimulation.included).toBe(3); // All 3 nodes should be included (small dataset)
    expect(response.contextSimulation.excluded).toBe(0);
    expect(response.contextSimulation.summary).toBeDefined();
  });

  it("filters by project when specified", async () => {
    // Add a node with different project
    storage.createNode({
      content: "Other project progress",
      type: "progress",
      tags: ["proj:other"],
      visibility: "private"
    });

    const result = await toolHandler({ project: "test", open_browser: false });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.metadata.totalNodes).toBe(3); // Only test project nodes
    expect(response.metadata.project).toBe("test");
  });

  it("supports custom output path", async () => {
    const customPath = path.join(testDir, "custom", "output.html");

    const result = await toolHandler({ output_path: customPath, open_browser: false });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.outputPath).toBe(customPath);
    expect(fs.existsSync(customPath)).toBe(true);
  });

  it("handles empty knowledge graph", async () => {
    // Create fresh empty storage
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "kg-empty-test-"));
    const emptyStorage = new FileStorage({ baseDir: emptyDir });

    let emptyToolHandler: (args: any) => Promise<any>;
    const emptyServer = {
      tool: (_name: string, _desc: string, _schema: any, handler: any) => {
        emptyToolHandler = handler;
      }
    } as any;

    setupDiagnosticTools(emptyServer, emptyStorage);

    const result = await emptyToolHandler!({ open_browser: false });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.metadata.totalNodes).toBe(0);

    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
