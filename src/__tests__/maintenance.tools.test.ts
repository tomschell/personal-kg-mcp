import { describe, it, expect, beforeEach } from "vitest";
import { setupMaintenanceTools } from "../tools/maintenance.js";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("maintenance tools registration", () => {
  it("registers all maintenance tools", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-maint-tools-"));
    const storage = new FileStorage({ baseDir });

    const registered: string[] = [];
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, _handler: unknown) => {
        registered.push(name);
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);

    expect(registered).toContain("kg_backup");
    expect(registered).toContain("kg_validate");
    expect(registered).toContain("kg_repair");
    expect(registered).toContain("kg_export");
    expect(registered).toContain("kg_import");
  });
});

describe("kg_backup functional tests", () => {
  let storage: FileStorage;
  let backupHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-backup-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_backup") backupHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("creates backup with default retention", async () => {
    const node = storage.createNode({
      content: "Test node for backup",
      type: "idea",
      tags: ["test"],
    });

    const result = await backupHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.backup.backupDir).toContain("backups");
    expect(response.backup.retentionDays).toBe(30);
    expect(response.message).toContain("Backup created successfully");
  });

  it("creates backup with custom retention", async () => {
    const result = await backupHandler({ retentionDays: 7 });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.backup.retentionDays).toBe(7);
    expect(response.message).toContain("7 day retention");
  });

  it("creates backup with zero retention (keep forever)", async () => {
    const result = await backupHandler({ retentionDays: 0 });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.backup.retentionDays).toBe(0);
  });
});

describe("kg_validate functional tests", () => {
  let storage: FileStorage;
  let validateHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-validate-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_validate") validateHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("validates clean knowledge graph", async () => {
    storage.createNode({
      content: "Valid test node",
      type: "idea",
      tags: ["test"],
    });

    const result = await validateHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.ok).toBe(true);
  });

  it("detects corrupted data", async () => {
    // Create a valid node first
    storage.createNode({
      content: "Valid test node",
      type: "idea",
      tags: ["test"],
    });

    // Inject corrupted data
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(storage.getEdgesDir(), "corrupted.json"), "{invalid json}");

    const result = await validateHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.ok).toBe(false);
    expect(response.invalidEdges).toBeGreaterThan(0);
  });
});

describe("kg_repair functional tests", () => {
  let storage: FileStorage;
  let repairHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-repair-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_repair") repairHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("repairs corrupted data", async () => {
    // Create valid data first
    storage.createNode({
      content: "Valid test node",
      type: "idea",
      tags: ["test"],
    });

    // Inject corrupted data
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(storage.getEdgesDir(), "corrupted.json"), "{invalid json}");

    const result = await repairHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.removedNodes).toBeGreaterThanOrEqual(0);
    expect(response.removedEdges).toBeGreaterThanOrEqual(0);
    expect(response.message).toContain("Repair complete");
  });

  it("handles clean knowledge graph", async () => {
    storage.createNode({
      content: "Valid test node",
      type: "idea",
      tags: ["test"],
    });

    const result = await repairHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.removedNodes).toBe(0);
    expect(response.removedEdges).toBe(0);
  });
});

describe("kg_export functional tests", () => {
  let storage: FileStorage;
  let exportHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-export-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_export") exportHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("exports empty knowledge graph", async () => {
    const result = await exportHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.nodes).toHaveLength(0);
    expect(response.edges).toHaveLength(0);
  });

  it("exports populated knowledge graph", async () => {
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

    const result = await exportHandler({});
    const response = JSON.parse(result.content[0].text);

    expect(response.nodes).toHaveLength(2);
    expect(response.edges).toHaveLength(1);
    expect(response.nodes.some((n: any) => n.id === node1.id)).toBe(true);
    expect(response.nodes.some((n: any) => n.id === node2.id)).toBe(true);
    expect(response.edges[0].fromNodeId).toBe(node1.id);
    expect(response.edges[0].toNodeId).toBe(node2.id);
  });
});

describe("kg_import functional tests", () => {
  let storage: FileStorage;
  let importHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-import-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_import") importHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("imports valid data", async () => {
    const exportData = {
      nodes: [
        {
          id: "test-node-1",
          type: "idea",
          content: "Imported test node 1",
          tags: ["test"],
          visibility: "private",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "test-node-2",
          type: "insight",
          content: "Imported test node 2",
          tags: ["test"],
          visibility: "private",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ],
      edges: [
        {
          id: "test-edge-1",
          fromNodeId: "test-node-1",
          toNodeId: "test-node-2",
          relation: "references",
          createdAt: new Date().toISOString(),
        }
      ]
    };

    const result = await importHandler({ payload: JSON.stringify(exportData) });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.nodes).toBe(2);
    expect(response.edges).toBe(1);
    expect(response.message).toContain("Import complete");
  });

  it("handles invalid import data", async () => {
    const result = await importHandler({ payload: "invalid json" });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(false);
    expect(response.error).toBe("Invalid import data format");
    expect(response.details).toBeDefined();
  });

  it("handles empty import data", async () => {
    const result = await importHandler({ payload: JSON.stringify({ nodes: [], edges: [] }) });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.nodes).toBe(0);
    expect(response.edges).toBe(0);
  });
});

describe("maintenance tools integration tests", () => {
  let storage: FileStorage;
  let backupHandler: any;
  let validateHandler: any;
  let repairHandler: any;
  let exportHandler: any;
  let importHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-maint-integration-"));
    storage = new FileStorage({ baseDir });
    
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_backup") backupHandler = handler;
        if (name === "kg_validate") validateHandler = handler;
        if (name === "kg_repair") repairHandler = handler;
        if (name === "kg_export") exportHandler = handler;
        if (name === "kg_import") importHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("performs complete maintenance workflow", async () => {
    // 1. Create some data
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

    // 2. Validate clean data
    const validateResult = await validateHandler({});
    const validateResponse = JSON.parse(validateResult.content[0].text);
    expect(validateResponse.ok).toBe(true);

    // 3. Create backup
    const backupResult = await backupHandler({ retentionDays: 7 });
    const backupResponse = JSON.parse(backupResult.content[0].text);
    expect(backupResponse.success).toBe(true);

    // 4. Export data
    const exportResult = await exportHandler({});
    const exportResponse = JSON.parse(exportResult.content[0].text);
    expect(exportResponse.nodes).toHaveLength(2);
    expect(exportResponse.edges).toHaveLength(1);

    // 5. Import data to new storage
    const newBaseDir = mkdtempSync(join(tmpdir(), "pkg-maint-import-"));
    const newStorage = new FileStorage({ baseDir: newBaseDir });
    
    const newMockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_import") importHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(newMockServer, newStorage);

    const importResult = await importHandler({ payload: JSON.stringify(exportResponse) });
    const importResponse = JSON.parse(importResult.content[0].text);
    expect(importResponse.success).toBe(true);
    expect(importResponse.nodes).toBe(2);
    expect(importResponse.edges).toBe(1);
  });

  it("handles data corruption and repair workflow", async () => {
    // 1. Create valid data
    storage.createNode({
      content: "Test node",
      type: "idea",
      tags: ["test"],
    });

    // 2. Validate clean data
    const validateResult = await validateHandler({});
    const validateResponse = JSON.parse(validateResult.content[0].text);
    expect(validateResponse.ok).toBe(true);

    // 3. Inject corruption
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(storage.getEdgesDir(), "corrupted.json"), "{invalid json}");

    // 4. Validate corrupted data
    const validateCorruptedResult = await validateHandler({});
    const validateCorruptedResponse = JSON.parse(validateCorruptedResult.content[0].text);
    expect(validateCorruptedResponse.ok).toBe(false);

    // 5. Repair corrupted data
    const repairResult = await repairHandler({});
    const repairResponse = JSON.parse(repairResult.content[0].text);
    expect(repairResponse.success).toBe(true);

    // 6. Validate repaired data
    const validateRepairedResult = await validateHandler({});
    const validateRepairedResponse = JSON.parse(validateRepairedResult.content[0].text);
    expect(validateRepairedResponse.ok).toBe(true);
  });
});
