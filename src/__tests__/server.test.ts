import { describe, it, expect } from "vitest";
import { getHealth } from "../handlers/health.js";

describe("personal-kg-mcp", () => {
  it("health handler returns ok", () => {
    const { result } = getHealth();
    expect(result.status).toBe("ok");
    expect(result.name).toBe("personal-kg-mcp");
  });
});


