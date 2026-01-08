import { describe, it, expect, beforeEach } from "vitest";
import { setupMaintenanceTools } from "../tools/maintenance.js";
import { FileStorage } from "../storage/FileStorage.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("maintenance tools registration", () => {
  it("registers kg_admin tool", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-maint-tools-"));
    const storage = new FileStorage({ baseDir });

    const registered: string[] = [];
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, _handler: unknown) => {
        registered.push(name);
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);

    expect(registered).toContain("kg_admin");
    expect(registered).toHaveLength(1);
  });
});

describe("kg_admin backup operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-backup-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("creates backup with default retention", async () => {
    storage.createNode({
      content: "Test node for backup",
      type: "idea",
      tags: ["test"],
    });

    const result = await adminHandler({ operation: "backup" });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("backup");
    expect(response.success).toBe(true);
    expect(response.backup.backupDir).toContain("backups");
    expect(response.message).toContain("Backup created successfully");
  });

  it("creates backup with custom retention", async () => {
    const result = await adminHandler({ operation: "backup", retentionDays: 7 });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.backup.retentionDays).toBe(7);
    expect(response.message).toContain("7 day retention");
  });

  it("creates backup with zero retention (keep forever)", async () => {
    const result = await adminHandler({ operation: "backup", retentionDays: 0 });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.backup.retentionDays).toBe(0);
  });
});

describe("kg_admin validate operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-validate-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
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

    const result = await adminHandler({ operation: "validate" });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("validate");
    expect(response.ok).toBe(true);
  });

  it("detects corrupted data", async () => {
    storage.createNode({
      content: "Valid test node",
      type: "idea",
      tags: ["test"],
    });

    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(storage.getEdgesDir(), "corrupted.json"), "{invalid json}");

    const result = await adminHandler({ operation: "validate" });
    const response = JSON.parse(result.content[0].text);

    expect(response.ok).toBe(false);
    expect(response.invalidEdges).toBeGreaterThan(0);
  });
});

describe("kg_admin repair operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-repair-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("repairs corrupted data", async () => {
    storage.createNode({
      content: "Valid test node",
      type: "idea",
      tags: ["test"],
    });

    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(storage.getEdgesDir(), "corrupted.json"), "{invalid json}");

    const result = await adminHandler({ operation: "repair" });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("repair");
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

    const result = await adminHandler({ operation: "repair" });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.removedNodes).toBe(0);
    expect(response.removedEdges).toBe(0);
  });
});

describe("kg_admin export operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-export-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("exports empty knowledge graph", async () => {
    const result = await adminHandler({ operation: "export" });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("export");
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

    const result = await adminHandler({ operation: "export" });
    const response = JSON.parse(result.content[0].text);

    expect(response.nodes).toHaveLength(2);
    expect(response.edges).toHaveLength(1);
    expect(response.nodes.some((n: any) => n.id === node1.id)).toBe(true);
    expect(response.nodes.some((n: any) => n.id === node2.id)).toBe(true);
    expect(response.edges[0].fromNodeId).toBe(node1.id);
    expect(response.edges[0].toNodeId).toBe(node2.id);
  });
});

describe("kg_admin import operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-import-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
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

    const result = await adminHandler({ operation: "import", payload: JSON.stringify(exportData) });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("import");
    expect(response.success).toBe(true);
    expect(response.nodes).toBe(2);
    expect(response.edges).toBe(1);
    expect(response.message).toContain("Import complete");
  });

  it("handles invalid import data", async () => {
    const result = await adminHandler({ operation: "import", payload: "invalid json" });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(false);
    expect(response.error).toBe("Invalid import data format");
    expect(response.details).toBeDefined();
  });

  it("handles empty import data", async () => {
    const result = await adminHandler({ operation: "import", payload: JSON.stringify({ nodes: [], edges: [] }) });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.nodes).toBe(0);
    expect(response.edges).toBe(0);
  });
});

describe("kg_admin health operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-health-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("returns health status", async () => {
    const result = await adminHandler({ operation: "health" });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("health");
    expect(response.status).toBeDefined();
  });
});

describe("kg_admin rename_tag operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-rename-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("renames tags on nodes", async () => {
    storage.createNode({
      content: "Test node 1",
      type: "idea",
      tags: ["old-tag", "other"],
    });
    storage.createNode({
      content: "Test node 2",
      type: "idea",
      tags: ["old-tag"],
    });

    const result = await adminHandler({ operation: "rename_tag", oldTag: "old-tag", newTag: "new-tag" });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("rename_tag");
    expect(response.success).toBe(true);
    expect(response.nodesUpdated).toBe(2);
  });

  it("supports dry run", async () => {
    storage.createNode({
      content: "Test node",
      type: "idea",
      tags: ["old-tag"],
    });

    const result = await adminHandler({ operation: "rename_tag", oldTag: "old-tag", newTag: "new-tag", dryRun: true });
    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.dryRun).toBe(true);
    expect(response.nodesUpdated).toBe(1);

    // Verify tag wasn't actually changed
    const nodes = storage.listAllNodes();
    expect(nodes[0].tags).toContain("old-tag");
  });
});

describe("kg_admin merge_tags operation", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-merge-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(mockServer, storage);
  });

  it("merges multiple tags into one", async () => {
    storage.createNode({
      content: "Test node 1",
      type: "idea",
      tags: ["tag-a", "other"],
    });
    storage.createNode({
      content: "Test node 2",
      type: "idea",
      tags: ["tag-b"],
    });

    const result = await adminHandler({
      operation: "merge_tags",
      sourceTags: ["tag-a", "tag-b"],
      targetTag: "merged-tag"
    });
    const response = JSON.parse(result.content[0].text);

    expect(response.operation).toBe("merge_tags");
    expect(response.success).toBe(true);
    expect(response.nodesUpdated).toBe(2);
  });
});

describe("kg_admin integration tests", () => {
  let storage: FileStorage;
  let adminHandler: any;

  beforeEach(() => {
    const baseDir = mkdtempSync(join(tmpdir(), "pkg-maint-integration-"));
    storage = new FileStorage({ baseDir });

    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") adminHandler = handler;
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
    const validateResult = await adminHandler({ operation: "validate" });
    const validateResponse = JSON.parse(validateResult.content[0].text);
    expect(validateResponse.ok).toBe(true);

    // 3. Create backup
    const backupResult = await adminHandler({ operation: "backup", retentionDays: 7 });
    const backupResponse = JSON.parse(backupResult.content[0].text);
    expect(backupResponse.success).toBe(true);

    // 4. Export data
    const exportResult = await adminHandler({ operation: "export" });
    const exportResponse = JSON.parse(exportResult.content[0].text);
    expect(exportResponse.nodes).toHaveLength(2);
    expect(exportResponse.edges).toHaveLength(1);

    // 5. Import data to new storage
    const newBaseDir = mkdtempSync(join(tmpdir(), "pkg-maint-import-"));
    const newStorage = new FileStorage({ baseDir: newBaseDir });

    let newAdminHandler: any;
    const newMockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: any) => {
        if (name === "kg_admin") newAdminHandler = handler;
      },
    } as unknown as Parameters<typeof setupMaintenanceTools>[0];

    setupMaintenanceTools(newMockServer, newStorage);

    const importResult = await newAdminHandler({ operation: "import", payload: JSON.stringify(exportResponse) });
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
    const validateResult = await adminHandler({ operation: "validate" });
    const validateResponse = JSON.parse(validateResult.content[0].text);
    expect(validateResponse.ok).toBe(true);

    // 3. Inject corruption
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(storage.getEdgesDir(), "corrupted.json"), "{invalid json}");

    // 4. Validate corrupted data
    const validateCorruptedResult = await adminHandler({ operation: "validate" });
    const validateCorruptedResponse = JSON.parse(validateCorruptedResult.content[0].text);
    expect(validateCorruptedResponse.ok).toBe(false);

    // 5. Repair corrupted data
    const repairResult = await adminHandler({ operation: "repair" });
    const repairResponse = JSON.parse(repairResult.content[0].text);
    expect(repairResponse.success).toBe(true);

    // 6. Validate repaired data
    const validateRepairedResult = await adminHandler({ operation: "validate" });
    const validateRepairedResponse = JSON.parse(validateRepairedResult.content[0].text);
    expect(validateRepairedResponse.ok).toBe(true);
  });
});
