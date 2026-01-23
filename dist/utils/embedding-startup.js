/**
 * Startup embedding health check and auto-migration utilities.
 *
 * Checks embedding coverage on server startup and optionally auto-migrates
 * nodes that are missing OpenAI embeddings.
 */
import { generateEmbeddingBatch, isOpenAIAvailable } from "./openai-embeddings.js";
/**
 * Check what percentage of nodes have OpenAI embeddings.
 * This is a fast synchronous scan - no API calls.
 */
export function checkEmbeddingCoverage(storage) {
    const nodes = storage.listAllNodes();
    const withEmbeddings = nodes.filter(n => n.embedding && n.embedding.length > 0).length;
    const missing = nodes.length - withEmbeddings;
    return {
        total: nodes.length,
        withEmbeddings,
        missing,
        missingPercent: nodes.length > 0 ? (missing / nodes.length) * 100 : 0,
    };
}
/**
 * Migrate nodes that are missing embeddings.
 * Processes in batches for efficiency.
 */
export async function migrateEmbeddings(storage, options = {}) {
    const { batchSize = 50 } = options;
    if (!isOpenAIAvailable()) {
        return { migrated: 0, failed: 0, errors: ["OpenAI not available"] };
    }
    const nodes = storage.listAllNodes().filter(n => !n.embedding || n.embedding.length === 0);
    let migrated = 0;
    let failed = 0;
    const errors = [];
    // Process in batches
    for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize);
        const texts = batch.map(n => n.content + " " + n.tags.join(" "));
        try {
            const embeddings = await generateEmbeddingBatch(texts);
            for (let j = 0; j < batch.length; j++) {
                const node = batch[j];
                const embedding = embeddings[j];
                if (embedding) {
                    try {
                        storage.updateNodeEmbedding(node.id, embedding);
                        migrated++;
                    }
                    catch (err) {
                        failed++;
                        errors.push(`Failed to store embedding for node ${node.id}`);
                    }
                }
                else {
                    failed++;
                    errors.push(`Failed to generate embedding for node ${node.id}`);
                }
            }
        }
        catch (err) {
            // Batch failed entirely
            failed += batch.length;
            errors.push(`Batch failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return { migrated, failed, errors };
}
/**
 * Run the startup embedding check based on configuration.
 *
 * Modes:
 * - "silent": No check
 * - "warn": Log warning if >10% nodes lack embeddings
 * - "auto": Automatically migrate missing embeddings
 */
export async function runStartupEmbeddingCheck(storage, mode = "warn") {
    if (mode === "silent") {
        return;
    }
    if (!isOpenAIAvailable()) {
        return;
    }
    const coverage = checkEmbeddingCoverage(storage);
    // Skip if coverage is good (>= 90%)
    if (coverage.missingPercent <= 10) {
        return;
    }
    // Skip if no nodes at all
    if (coverage.total === 0) {
        return;
    }
    if (mode === "auto") {
        console.error(`[PKG] Auto-migrating ${coverage.missing} nodes to OpenAI embeddings...`);
        const result = await migrateEmbeddings(storage, { batchSize: 50 });
        if (result.failed > 0) {
            console.error(`[PKG] Migration complete: ${result.migrated} nodes embedded, ${result.failed} failed`);
        }
        else {
            console.error(`[PKG] Migration complete: ${result.migrated} nodes embedded`);
        }
    }
    else {
        // warn mode
        console.error(`[PKG] WARNING: ${coverage.missing}/${coverage.total} nodes (${coverage.missingPercent.toFixed(1)}%) lack embeddings`);
        console.error(`[PKG] Run kg_admin({ operation: "migrate_embeddings" }) or set PKG_EMBEDDING_STARTUP=auto`);
    }
}
