import { describe, it, expect } from "vitest";
import { scoreRelationship } from "../utils/relationships.js";
describe("relationship scoring", () => {
    it("scores related content higher", () => {
        const now = new Date().toISOString();
        const a = { id: "a", type: "idea", content: "Implement git integration and commit capture", tags: ["git"], visibility: "private", createdAt: now, updatedAt: now };
        const b = { id: "b", type: "insight", content: "Capture git branch and commit for nodes", tags: ["git"], visibility: "private", createdAt: now, updatedAt: now };
        const c = { id: "c", type: "idea", content: "Sailboat hull type vocabulary and specs", tags: ["boats"], visibility: "private", createdAt: now, updatedAt: now };
        expect(scoreRelationship(a, b)).toBeGreaterThan(scoreRelationship(a, c));
    });
});
