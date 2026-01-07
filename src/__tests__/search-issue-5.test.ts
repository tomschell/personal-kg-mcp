import { describe, it, expect } from "vitest";
import { embedText, cosineSimilarity } from "../utils/embeddings.js";

describe("Issue #5: Semantic search behavior with single terms vs phrases", () => {
  it("shows similarity difference between single term and phrase searches", () => {
    // Simulated node content similar to the issue report
    const nodeContent = `Fixed bug in DetailListingExtractor where price extraction was failing.
    Updated the scraping logic to handle edge cases in price formatting.
    Added tests for various price formats and data quality validation.`;

    // Single term search
    const singleTermQuery = "DetailListingExtractor";
    const singleTermVec = embedText(singleTermQuery);
    const nodeVec = embedText(nodeContent);
    const singleTermScore = cosineSimilarity(singleTermVec, nodeVec);

    // Phrase search
    const phraseQuery = "DetailListingExtractor price extraction bug";
    const phraseVec = embedText(phraseQuery);
    const phraseScore = cosineSimilarity(phraseVec, nodeVec);

    console.log(`Single term score: ${singleTermScore.toFixed(4)}`);
    console.log(`Phrase score: ${phraseScore.toFixed(4)}`);
    console.log(`Ratio: ${(phraseScore / singleTermScore).toFixed(2)}x`);

    // Document the behavior
    expect(phraseScore).toBeGreaterThan(singleTermScore);
  });

  it("analyzes embedding sparsity for single terms vs phrases", () => {
    const singleTerm = "DetailListingExtractor";
    const phrase = "DetailListingExtractor price extraction bug";

    const singleVec = embedText(singleTerm);
    const phraseVec = embedText(phrase);

    // Count non-zero dimensions
    const countNonZero = (vec: Float32Array) => {
      let count = 0;
      for (let i = 0; i < vec.length; i++) {
        if (vec[i] > 0) count++;
      }
      return count;
    };

    const singleNonZero = countNonZero(singleVec);
    const phraseNonZero = countNonZero(phraseVec);

    console.log(`Single term activates ${singleNonZero} dimensions`);
    console.log(`Phrase activates ${phraseNonZero} dimensions`);

    // Phrases activate more dimensions
    expect(phraseNonZero).toBeGreaterThan(singleNonZero);
  });

  it("verifies compound term tokenization is now fixed", () => {
    // CamelCase compound terms should now be split properly
    const camelCase = "DetailListingExtractor";
    const separated = "detail listing extractor";

    const camelVec = embedText(camelCase);
    const separatedVec = embedText(separated);

    const countNonZero = (vec: Float32Array) => {
      let count = 0;
      for (let i = 0; i < vec.length; i++) {
        if (vec[i] > 0) count++;
      }
      return count;
    };

    const camelNonZero = countNonZero(camelVec);
    const separatedNonZero = countNonZero(separatedVec);

    console.log(`CamelCase activates ${camelNonZero} dimensions`);
    console.log(`Separated activates ${separatedNonZero} dimensions`);

    // After fix: CamelCase and separated should activate same dimensions
    expect(camelNonZero).toBe(separatedNonZero);
    expect(camelNonZero).toBeGreaterThanOrEqual(3); // detail, listing, extractor
  });
});
