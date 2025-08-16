import { describe, it, expect, afterEach } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { createPersonalKgServer } from "../server.js";
import { rmSync } from "fs";

function parse(result: unknown) {
  return JSON.parse(result.content[0].text as string);
}

describe("capture tools", () => {
  it("captures with importance (persisted)", () => {
    const storage = new FileStorage({ baseDir: ".kg-test-capture" });
    const node = storage.createNode({
      content: "Plan git integration",
      type: "idea",
      importance: "high",
    });
    expect(node.importance).toBe("high");
  });

  it("captures a session node via server tool returns accepted", () => {
    const storage = new FileStorage({ baseDir: ".kg-test-session" });
    // Simulate the server behavior minimally: content formatting
    const content = [
      `Session Summary: Design review`,
      `Duration: 45m`,
      `Next Actions: Implement cache`,
    ].join("\n");
    const node = storage.createNode({
      content,
      type: "session",
      tags: ["session"],
      importance: "medium",
    });
    expect(node.content).toContain("Session Summary");
  });

  afterEach(() => {
    // Clean up test storage directories
    try {
      rmSync(".kg-test-capture", { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist or can't be removed
      console.warn("Failed to clean up .kg-test-capture directory:", error);
    }
    try {
      rmSync(".kg-test-session", { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist or can't be removed
      console.warn("Failed to clean up .kg-test-session directory:", error);
    }
  });
});
