import { describe, it, expect } from "vitest";
import { tokenize, embedText, cosineSimilarity } from "../utils/embeddings.js";

describe("Tokenization", () => {
  describe("tokenize function", () => {
    it("splits camelCase identifiers", () => {
      const tokens = tokenize("camelCaseVariable");
      expect(tokens).toEqual(["camel", "case", "variable"]);
    });

    it("splits PascalCase identifiers", () => {
      const tokens = tokenize("PascalCaseClass");
      expect(tokens).toEqual(["pascal", "case", "class"]);
    });

    it("splits mixed camelCase identifiers", () => {
      const tokens = tokenize("DetailListingExtractor");
      expect(tokens).toEqual(["detail", "listing", "extractor"]);
    });

    it("handles snake_case", () => {
      const tokens = tokenize("snake_case_variable");
      expect(tokens).toEqual(["snake", "case", "variable"]);
    });

    it("handles kebab-case", () => {
      const tokens = tokenize("kebab-case-variable");
      expect(tokens).toEqual(["kebab", "case", "variable"]);
    });

    it("splits numbers from text", () => {
      const tokens = tokenize("test123variable");
      expect(tokens).toEqual(["test", "123", "variable"]);
    });

    it("handles mixed case with numbers", () => {
      const tokens = tokenize("OAuth2Token");
      expect(tokens).toEqual(["o", "auth", "2", "token"]);
    });

    it("handles API key patterns", () => {
      const tokens = tokenize("API_KEY_CONFIG");
      expect(tokens).toEqual(["api", "key", "config"]);
    });

    it("handles version numbers", () => {
      const tokens = tokenize("version1.2.3beta");
      expect(tokens).toEqual(["version", "1", "2", "3", "beta"]);
    });

    it("normalizes to lowercase", () => {
      const tokens = tokenize("MixedCASE");
      expect(tokens).toEqual(["mixed", "case"]);
    });

    it("removes special characters", () => {
      const tokens = tokenize("test@email.com");
      expect(tokens).toEqual(["test", "email", "com"]);
    });

    it("handles multiple spaces", () => {
      const tokens = tokenize("multiple   spaces");
      expect(tokens).toEqual(["multiple", "spaces"]);
    });

    it("filters empty strings", () => {
      const tokens = tokenize("  leading trailing  ");
      expect(tokens).toEqual(["leading", "trailing"]);
    });

    it("handles complex real-world identifier", () => {
      const tokens = tokenize("getUserById123_v2");
      expect(tokens).toEqual(["get", "user", "by", "id", "123", "v", "2"]);
    });
  });

  describe("Embedding improvements", () => {
    it("now matches camelCase with separated words", () => {
      const camelVec = embedText("DetailListingExtractor");
      const separatedVec = embedText("detail listing extractor");
      const similarity = cosineSimilarity(camelVec, separatedVec);

      // Should be identical or very close (might differ slightly due to normalization)
      expect(similarity).toBeGreaterThan(0.95);
    });

    it("improves single term search similarity", () => {
      const nodeContent = `Fixed bug in DetailListingExtractor where price extraction was failing.
        Updated the scraping logic to handle edge cases in price formatting.
        Added tests for various price formats and data quality validation.`;

      const singleTermQuery = "DetailListingExtractor";
      const singleTermVec = embedText(singleTermQuery);
      const nodeVec = embedText(nodeContent);
      const similarity = cosineSimilarity(singleTermVec, nodeVec);

      // With improved tokenization, similarity should be higher than the old 0.2887
      expect(similarity).toBeGreaterThan(0.29);
    });

    it("activates more dimensions for camelCase terms", () => {
      const vec = embedText("DetailListingExtractor");

      const countNonZero = (v: Float32Array) => {
        let count = 0;
        for (let i = 0; i < v.length; i++) {
          if (v[i] > 0) count++;
        }
        return count;
      };

      const nonZero = countNonZero(vec);
      // Should now activate 3 dimensions (detail, listing, extractor) instead of 1
      expect(nonZero).toBeGreaterThanOrEqual(3);
    });

    it("handles technical terms better", () => {
      const term1 = embedText("OAuth2Authentication");
      const term2 = embedText("OAuth authentication");
      const similarity = cosineSimilarity(term1, term2);

      // Should have significant overlap due to "oauth" and "authentication" tokens
      expect(similarity).toBeGreaterThan(0.4);
    });
  });

  describe("Backwards compatibility", () => {
    it("still handles simple text correctly", () => {
      const tokens = tokenize("simple text string");
      expect(tokens).toEqual(["simple", "text", "string"]);
    });

    it("maintains semantic relationships", () => {
      const a = embedText("Implement git integration and capture commit context");
      const b = embedText("Capture git commit and branch for knowledge nodes");
      const c = embedText("Sailing boat specifications and hull types");

      expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
    });
  });
});
