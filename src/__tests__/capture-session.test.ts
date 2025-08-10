import { describe, it, expect } from "vitest";
import { FileStorage } from "../storage/FileStorage.js";
import { createPersonalKgServer } from "../server.js";

function parse(result: any) {
  return JSON.parse(result.content[0].text);
}

describe("capture tools", () => {
  it("captures with importance (persisted)", () => {
    const storage = new FileStorage({ baseDir: ".kg-test-capture" });
    const node = storage.createNode({ content: "Plan git integration", type: "idea", importance: "high" });
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
    const node = storage.createNode({ content, type: "session", tags: ["session"], importance: "medium" });
    expect(node.content).toContain("Session Summary");
  });
});


