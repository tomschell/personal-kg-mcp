import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rmSync } from "fs";
import { FileStorage } from "../storage/FileStorage.js";
import {
  embedText,
  embedTextLocal,
  embedTextSync,
  embedTextAsync,
  cosineSimilarity,
  isOpenAIAvailable,
} from "../utils/embeddings.js";

describe("Unified Embedding Interface", () => {
  describe("embedTextLocal (bag-of-words)", () => {
    it("produces higher similarity for related texts", () => {
      const a = embedTextLocal("Implement git integration and capture commit context");
      const b = embedTextLocal("Capture git commit and branch for knowledge nodes");
      const c = embedTextLocal("Sailing boat specifications and hull types");

      expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
    });

    it("returns Float32Array of specified dimension", () => {
      const vec256 = embedTextLocal("test text", 256);
      const vec512 = embedTextLocal("test text", 512);

      expect(vec256).toBeInstanceOf(Float32Array);
      expect(vec256.length).toBe(256);
      expect(vec512.length).toBe(512);
    });

    it("produces normalized vectors", () => {
      const vec = embedTextLocal("test text for normalization check");
      let norm = 0;
      for (let i = 0; i < vec.length; i++) {
        norm += vec[i] * vec[i];
      }
      // Should be approximately 1.0 (unit vector)
      expect(Math.abs(Math.sqrt(norm) - 1)).toBeLessThan(0.001);
    });
  });

  describe("cosineSimilarity", () => {
    it("returns 0 for vectors of different dimensions", () => {
      const a = embedTextLocal("test", 256);
      const b = embedTextLocal("test", 512);

      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it("returns 1 for identical vectors", () => {
      const vec = embedTextLocal("identical text");
      const similarity = cosineSimilarity(vec, vec);

      // Should be very close to 1
      expect(similarity).toBeGreaterThan(0.999);
    });

    it("works with regular number arrays", () => {
      const a = [0.5, 0.5, 0.5, 0.5];
      const b = [0.5, 0.5, 0.5, 0.5];

      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    it("handles mixed Float32Array and number array", () => {
      const a = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const b = [0.5, 0.5, 0.5, 0.5];

      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });
  });

  describe("embedTextSync (backwards compatibility)", () => {
    it("is equivalent to embedTextLocal", () => {
      const text = "test text for sync";
      const local = embedTextLocal(text);
      const sync = embedTextSync(text);

      // Arrays should be identical
      expect(sync.length).toBe(local.length);
      for (let i = 0; i < sync.length; i++) {
        expect(sync[i]).toBeCloseTo(local[i], 10);
      }
    });
  });

  describe("embedText alias", () => {
    it("is an alias for embedTextLocal", () => {
      const text = "test alias";
      const alias = embedText(text);
      const local = embedTextLocal(text);

      expect(alias.length).toBe(local.length);
      for (let i = 0; i < alias.length; i++) {
        expect(alias[i]).toBeCloseTo(local[i], 10);
      }
    });
  });

  describe("isOpenAIAvailable", () => {
    it("returns false when no API key is set", () => {
      // Without explicit initialization, should return false
      expect(isOpenAIAvailable()).toBe(false);
    });
  });

  describe("embedTextAsync", () => {
    it("falls back to local when OpenAI is not available", async () => {
      const result = await embedTextAsync("test text");

      // Should return Float32Array from local embedding
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(256);
    });
  });
});

describe("KnowledgeNode embedding persistence", () => {
  const testDir = ".kg-test-openai-embedding";

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  it("stores embedding in node", () => {
    const storage = new FileStorage({ baseDir: testDir });
    const node = storage.createNode({
      content: "Test content",
      type: "idea",
    });

    // Initially no embedding
    expect(node.embedding).toBeUndefined();

    // Add embedding via update
    const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const updated = storage.updateNode(node.id, { embedding: testEmbedding });

    expect(updated?.embedding).toEqual(testEmbedding);
  });

  it("persists embedding to disk and retrieves it", () => {
    const storage = new FileStorage({ baseDir: testDir });
    const node = storage.createNode({
      content: "Test content for persistence",
      type: "insight",
    });

    const testEmbedding = Array.from({ length: 1536 }, (_, i) => i / 1536);
    storage.updateNodeEmbedding(node.id, testEmbedding);

    // Create new storage instance to force disk read
    const storage2 = new FileStorage({ baseDir: testDir });
    const retrieved = storage2.getNode(node.id);

    expect(retrieved?.embedding).toBeDefined();
    expect(retrieved?.embedding?.length).toBe(1536);
    expect(retrieved?.embedding?.[0]).toBeCloseTo(testEmbedding[0], 5);
    expect(retrieved?.embedding?.[1535]).toBeCloseTo(testEmbedding[1535], 5);
  });

  it("updateNodeEmbedding does not change updatedAt", () => {
    const storage = new FileStorage({ baseDir: testDir });
    const node = storage.createNode({
      content: "Test for timestamp preservation",
      type: "decision",
    });

    const originalUpdatedAt = node.updatedAt;

    // Small delay to ensure timestamps would differ if changed
    const start = Date.now();
    while (Date.now() - start < 5) { /* wait */ }

    const testEmbedding = [0.1, 0.2, 0.3];
    storage.updateNodeEmbedding(node.id, testEmbedding);

    const retrieved = storage.getNode(node.id);
    expect(retrieved?.updatedAt).toBe(originalUpdatedAt);
  });
});

describe("Embedding type compatibility in search", () => {
  it("cosineSimilarity handles OpenAI dimension embeddings", () => {
    // Simulate OpenAI embeddings (1536 dimensions)
    const openaiEmbed1 = Array.from({ length: 1536 }, () => Math.random() - 0.5);
    const openaiEmbed2 = Array.from({ length: 1536 }, () => Math.random() - 0.5);

    // Normalize
    const norm1 = Math.sqrt(openaiEmbed1.reduce((s, v) => s + v * v, 0));
    const norm2 = Math.sqrt(openaiEmbed2.reduce((s, v) => s + v * v, 0));
    const normalized1 = openaiEmbed1.map(v => v / norm1);
    const normalized2 = openaiEmbed2.map(v => v / norm2);

    const similarity = cosineSimilarity(normalized1, normalized2);

    // Should be a valid similarity score
    expect(similarity).toBeGreaterThanOrEqual(-1);
    expect(similarity).toBeLessThanOrEqual(1);
  });

  it("rejects comparison between different dimension embeddings", () => {
    const local = embedTextLocal("test", 256);
    const openai = Array.from({ length: 1536 }, () => 0.01);

    const similarity = cosineSimilarity(local, openai);
    expect(similarity).toBe(0); // Should return 0 for incompatible dimensions
  });
});
