/**
 * OpenAI Embeddings Provider
 *
 * Provides high-quality semantic embeddings using OpenAI's text-embedding-3-small model.
 * Includes graceful fallback to local bag-of-words embeddings when API key is unavailable.
 */
import OpenAI from "openai";
let client = null;
/**
 * Initialize the OpenAI client with the provided API key.
 * Falls back to OPENAI_API_KEY environment variable if not provided.
 *
 * @param apiKey - Optional API key (uses env var if not provided)
 * @returns true if client was initialized successfully
 */
export function initOpenAI(apiKey) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
        console.error("[PKG] No OpenAI API key provided - semantic search will use local embeddings");
        return false;
    }
    try {
        client = new OpenAI({ apiKey: key });
        console.error("[PKG] OpenAI client initialized successfully");
        return true;
    }
    catch (error) {
        console.error("[PKG] Failed to initialize OpenAI client:", error);
        return false;
    }
}
/**
 * Generate an embedding vector for the given text using OpenAI's API.
 *
 * @param text - Text to generate embedding for
 * @returns Embedding vector as number array, or null if unavailable
 */
export async function generateEmbedding(text) {
    if (!client) {
        return null;
    }
    try {
        const model = process.env.PKG_EMBEDDING_MODEL || "text-embedding-3-small";
        // Truncate to avoid token limits (8191 tokens max for text-embedding-3-small)
        // Using character limit as approximation (~4 chars per token)
        const truncatedText = text.slice(0, 30000);
        const response = await client.embeddings.create({
            model,
            input: truncatedText,
        });
        return response.data[0].embedding;
    }
    catch (error) {
        console.error("[PKG] OpenAI embedding error:", error);
        return null;
    }
}
/**
 * Generate embeddings for multiple texts in a batch.
 * More efficient than calling generateEmbedding repeatedly.
 *
 * @param texts - Array of texts to generate embeddings for
 * @returns Array of embedding vectors (null for failed ones)
 */
export async function generateEmbeddingBatch(texts) {
    if (!client || texts.length === 0) {
        return texts.map(() => null);
    }
    try {
        const model = process.env.PKG_EMBEDDING_MODEL || "text-embedding-3-small";
        // Truncate each text
        const truncatedTexts = texts.map((t) => t.slice(0, 30000));
        const response = await client.embeddings.create({
            model,
            input: truncatedTexts,
        });
        // Map results back to original indices
        const results = new Array(texts.length).fill(null);
        for (const item of response.data) {
            results[item.index] = item.embedding;
        }
        return results;
    }
    catch (error) {
        console.error("[PKG] OpenAI batch embedding error:", error);
        return texts.map(() => null);
    }
}
/**
 * Check if OpenAI embeddings are available.
 *
 * @returns true if OpenAI client is initialized
 */
export function isOpenAIAvailable() {
    return client !== null;
}
/**
 * Get the configured embedding model name.
 *
 * @returns Model name string
 */
export function getEmbeddingModel() {
    return process.env.PKG_EMBEDDING_MODEL || "text-embedding-3-small";
}
/**
 * Get the expected embedding dimensions for the configured model.
 *
 * @returns Dimension count (1536 for text-embedding-3-small)
 */
export function getEmbeddingDimensions() {
    const model = getEmbeddingModel();
    // text-embedding-3-small and text-embedding-3-large both default to 1536
    // but can be configured for smaller dimensions
    const configuredDim = process.env.PKG_EMBEDDING_DIM;
    if (configuredDim) {
        return parseInt(configuredDim, 10);
    }
    // Default dimensions by model
    switch (model) {
        case "text-embedding-3-large":
            return 3072;
        case "text-embedding-3-small":
        case "text-embedding-ada-002":
        default:
            return 1536;
    }
}
