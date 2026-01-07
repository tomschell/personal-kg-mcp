import { describe, it, expect } from "vitest";
import { embedText, cosineSimilarity } from "../utils/embeddings.js";

describe("Embedding Dimension Analysis", () => {
  const testCases = [
    {
      name: "Technical terms",
      text1: "DetailListingExtractor price extraction bug fix",
      text2: "DetailListingExtractor data parsing improvements",
      text3: "Sailing boat specifications and navigation",
    },
    {
      name: "Semantic concepts with overlap",
      text1: "Implemented authentication system with OAuth2",
      text2: "Authentication and user login with session management",
      text3: "Database schema migration and backup scripts",
    },
  ];

  describe("256 dimensions (current)", () => {
    testCases.forEach(({ name, text1, text2, text3 }) => {
      it(`discriminates ${name}`, () => {
        const v1 = embedText(text1, 256);
        const v2 = embedText(text2, 256);
        const v3 = embedText(text3, 256);

        const related = cosineSimilarity(v1, v2);
        const unrelated = cosineSimilarity(v1, v3);

        console.log(`[256] ${name}: related=${related.toFixed(4)}, unrelated=${unrelated.toFixed(4)}, ratio=${(related / unrelated).toFixed(2)}x`);

        expect(related).toBeGreaterThan(unrelated);
      });
    });
  });

  describe("512 dimensions", () => {
    testCases.forEach(({ name, text1, text2, text3 }) => {
      it(`discriminates ${name}`, () => {
        const v1 = embedText(text1, 512);
        const v2 = embedText(text2, 512);
        const v3 = embedText(text3, 512);

        const related = cosineSimilarity(v1, v2);
        const unrelated = cosineSimilarity(v1, v3);

        console.log(`[512] ${name}: related=${related.toFixed(4)}, unrelated=${unrelated.toFixed(4)}, ratio=${(related / unrelated).toFixed(2)}x`);

        expect(related).toBeGreaterThan(unrelated);
      });
    });
  });

  describe("1024 dimensions", () => {
    testCases.forEach(({ name, text1, text2, text3 }) => {
      it(`discriminates ${name}`, () => {
        const v1 = embedText(text1, 1024);
        const v2 = embedText(text2, 1024);
        const v3 = embedText(text3, 1024);

        const related = cosineSimilarity(v1, v2);
        const unrelated = cosineSimilarity(v1, v3);

        console.log(`[1024] ${name}: related=${related.toFixed(4)}, unrelated=${unrelated.toFixed(4)}, ratio=${(related / unrelated).toFixed(2)}x`);

        expect(related).toBeGreaterThan(unrelated);
      });
    });
  });

  describe("Hash collision analysis", () => {
    it("measures collision rate for different dimensions", () => {
      const text = "Implement smart context balancing for session warmup with importance weighting temporal decay diversity scoring and clustering";

      [256, 512, 1024].forEach((dim) => {
        const vec = embedText(text, dim);
        let nonZero = 0;
        for (let i = 0; i < vec.length; i++) {
          if (vec[i] > 0) nonZero++;
        }
        const collisionRate = ((vec.length - nonZero) / vec.length * 100).toFixed(1);
        console.log(`[${dim}] Non-zero: ${nonZero}/${dim}, Collision rate: ${collisionRate}%`);

        // Higher dimensions should have fewer collisions
        expect(nonZero).toBeGreaterThan(0);
      });
    });
  });

  describe("Performance characteristics", () => {
    it("measures embedding generation time", () => {
      const text = "Test text for performance measurement";
      const iterations = 1000;

      [256, 512, 1024].forEach((dim) => {
        const start = Date.now();
        for (let i = 0; i < iterations; i++) {
          embedText(text, dim);
        }
        const elapsed = Date.now() - start;
        const perOp = (elapsed / iterations).toFixed(3);
        console.log(`[${dim}] ${iterations} embeddings in ${elapsed}ms (${perOp}ms/op)`);
      });
    });
  });
});
