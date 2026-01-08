/**
 * Query Expansion Utilities
 * Expands search queries with synonyms and related terms
 */
import { tokenize } from "./embeddings.js";
import { DEFAULT_TAG_SYNONYMS } from "./tagEnhancements.js";
/**
 * Expand a search query to include synonyms
 * @param query Original search query
 * @param synonymMap Custom synonym map (defaults to DEFAULT_TAG_SYNONYMS)
 * @returns Object with original query and expanded terms
 */
export function expandQuery(query, synonymMap = DEFAULT_TAG_SYNONYMS) {
    // Tokenize the query
    const tokens = tokenize(query);
    // Expand each token with synonyms
    const expandedSet = new Set();
    for (const token of tokens) {
        // Add original token
        expandedSet.add(token);
        // Add synonyms if available
        const synonyms = synonymMap[token] || [];
        for (const syn of synonyms) {
            expandedSet.add(syn);
        }
    }
    const expanded = Array.from(expandedSet);
    const expandedQuery = expanded.join(" ");
    return {
        original: query,
        tokens,
        expanded,
        expandedQuery,
    };
}
/**
 * Check if content matches an expanded query
 * @param content Content to check
 * @param expandedTerms Expanded query terms
 * @returns Match score (0-1) based on term coverage
 */
export function scoreExpandedQueryMatch(content, expandedTerms) {
    const contentTokens = new Set(tokenize(content));
    let matches = 0;
    for (const term of expandedTerms) {
        if (contentTokens.has(term)) {
            matches++;
        }
    }
    return expandedTerms.length > 0 ? matches / expandedTerms.length : 0;
}
/**
 * Multi-term query expansion
 * Handles phrases and multi-word queries intelligently
 * @param query Original query (may contain multiple words/phrases)
 * @param synonymMap Custom synonym map
 * @returns Expanded query variations
 */
export function expandQueryAdvanced(query, synonymMap = DEFAULT_TAG_SYNONYMS) {
    const tokens = tokenize(query);
    const variations = [query]; // Always include original
    const allTermsSet = new Set(tokens);
    // Generate variations by substituting synonyms
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const synonyms = synonymMap[token] || [];
        for (const syn of synonyms) {
            // Create variation with this synonym substituted
            const variation = [...tokens];
            variation[i] = syn;
            variations.push(variation.join(" "));
            allTermsSet.add(syn);
        }
    }
    return {
        original: query,
        variations: [...new Set(variations)], // Deduplicate
        allTerms: Array.from(allTermsSet),
    };
}
/**
 * Extract key terms from query for boosting
 * Identifies important terms that should be weighted higher
 * @param query Search query
 * @returns Array of key terms (sorted by importance)
 */
export function extractKeyTerms(query) {
    const tokens = tokenize(query);
    // Filter out common stop words (simplified list)
    const stopWords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at",
        "to", "for", "of", "with", "by", "from", "is", "was",
        "are", "were", "be", "been", "being", "have", "has", "had",
    ]);
    const keyTerms = tokens.filter(t => !stopWords.has(t));
    // Longer terms are generally more specific/important
    return keyTerms.sort((a, b) => b.length - a.length);
}
