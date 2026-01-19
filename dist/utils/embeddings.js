/**
 * Unified Embedding Interface
 *
 * Provides both OpenAI-powered semantic embeddings and local bag-of-words fallback.
 * OpenAI embeddings are used when OPENAI_API_KEY is available, otherwise falls back
 * to local FNV hash-based bag-of-words embeddings.
 */
import { generateEmbedding as openaiEmbed, generateEmbeddingBatch as openaiEmbedBatch, isOpenAIAvailable, } from "./openai-embeddings.js";
/**
 * Tokenizes text with improved handling for technical terms
 * - Splits camelCase: "camelCase" -> "camel case"
 * - Splits PascalCase: "PascalCase" -> "pascal case"
 * - Splits numbers from text: "test123" -> "test 123"
 * - Handles snake_case: "snake_case" -> "snake case"
 */
export function tokenize(text) {
    return text
        // Split camelCase and PascalCase BEFORE lowercasing: "camelCase" -> "camel Case"
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        // Split consecutive capitals followed by lowercase: "XMLParser" -> "XML Parser"
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        // Convert to lowercase
        .toLowerCase()
        // Split lowercase followed by number: "test123" -> "test 123"
        .replace(/([a-z])([0-9])/g, "$1 $2")
        // Split number followed by lowercase: "123test" -> "123 test"
        .replace(/([0-9])([a-z])/g, "$1 $2")
        // Convert underscores and dashes to spaces
        .replace(/[_-]/g, " ")
        // Remove all other special characters
        .replace(/[^a-z0-9\s]/g, " ")
        // Split on whitespace and filter empty
        .split(/\s+/)
        .filter(Boolean);
}
/**
 * Local bag-of-words embedding using FNV hash.
 * Used as fallback when OpenAI is unavailable.
 *
 * @param text - Text to embed
 * @param dim - Vector dimension (default 256)
 * @returns Normalized Float32Array vector
 */
export function embedTextLocal(text, dim = 256) {
    const vec = new Float32Array(dim);
    const tokens = tokenize(text);
    for (const t of tokens) {
        let h = 2166136261;
        for (let i = 0; i < t.length; i++)
            h = (h ^ t.charCodeAt(i)) * 16777619;
        const idx = Math.abs(h) % dim;
        vec[idx] += 1;
    }
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < dim; i++)
        norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++)
        vec[i] /= norm;
    return vec;
}
// Alias for backwards compatibility
export const embedText = embedTextLocal;
/**
 * Synchronous embedding function for compatibility.
 * Always uses local bag-of-words (cannot await OpenAI).
 *
 * @param text - Text to embed
 * @param dim - Vector dimension (default 256)
 * @returns Normalized Float32Array vector
 */
export function embedTextSync(text, dim = 256) {
    return embedTextLocal(text, dim);
}
/**
 * Async embedding function that uses OpenAI when available.
 * Falls back to local bag-of-words when OpenAI is unavailable.
 *
 * @param text - Text to embed
 * @param localDim - Dimension for local fallback (default 256)
 * @returns OpenAI embedding (number[]) or local embedding (Float32Array)
 */
export async function embedTextAsync(text, localDim = 256) {
    if (isOpenAIAvailable()) {
        const embedding = await openaiEmbed(text);
        if (embedding)
            return embedding;
    }
    // Fallback to local bag-of-words
    return embedTextLocal(text, localDim);
}
/**
 * Batch async embedding function.
 * Uses OpenAI batch API when available for efficiency.
 *
 * @param texts - Array of texts to embed
 * @param localDim - Dimension for local fallback (default 256)
 * @returns Array of embeddings
 */
export async function embedTextBatchAsync(texts, localDim = 256) {
    if (isOpenAIAvailable()) {
        const embeddings = await openaiEmbedBatch(texts);
        // Replace nulls with local fallback
        return embeddings.map((emb, i) => emb !== null ? emb : embedTextLocal(texts[i], localDim));
    }
    // Fallback to local bag-of-words
    return texts.map((t) => embedTextLocal(t, localDim));
}
/**
 * Cosine similarity between two vectors.
 * Works with both Float32Array (local) and number[] (OpenAI) vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        // Incompatible dimensions - can't compare
        return 0;
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0)
        return 0;
    return dot / denominator;
}
/**
 * Check if semantic (OpenAI) embeddings are available.
 *
 * @returns true if OpenAI embeddings can be used
 */
export { isOpenAIAvailable };
