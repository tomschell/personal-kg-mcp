# Feature: OpenAI Semantic Embeddings

**Status:** Implemented
**Priority:** P1
**Created:** 2026-01-19
**Issue:** #6 (supersedes Ollama proposal)

## Overview

Upgrade the Personal KG semantic search from bag-of-words hashing to OpenAI's `text-embedding-3-small` model. This enables true semantic search where conceptually similar content is found even without keyword overlap.

## Background

**Current implementation:**
- `src/utils/embeddings.ts` uses FNV hash-based bag-of-words to 256-dimension vectors
- No semantic understanding - "similar boats" won't find "matching profiles"
- Search quality degrades significantly for conceptual queries

**Prototype results (2026-01-19):**

| Query | Bag-of-Words | OpenAI Embeddings |
|-------|--------------|-------------------|
| "how do I find similar boats" | Irrelevant results (0.30) | Matching system content (0.46) |
| "database performance" | Slack test message (!!) | DB connection failures (0.34) |
| "scraping cloudflare bypass" | 1/3 relevant | Chrome MCP bypass methods (0.41) |

**Why OpenAI over Ollama (Issue #6):**
- Already proven in Hoist pgvector implementation
- No local infrastructure required
- Better quality embeddings
- Negligible cost (~$0.00001 per capture)

## Technical Specification

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        kg_capture()                              │
│  1. Create node                                                  │
│  2. Call OpenAI embeddings API                                   │
│  3. Store embedding in node JSON file                            │
│  4. Update ANN index (if enabled)                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    kg_semantic_search()                          │
│  1. Call OpenAI embeddings API for query                         │
│  2. Compare against stored embeddings (cosine similarity)        │
│  3. Return ranked results                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Files to Create

| File | Description |
|------|-------------|
| `src/utils/openai-embeddings.ts` | OpenAI embedding provider with caching and fallback |

### Files to Modify

| File | Change |
|------|--------|
| `src/utils/embeddings.ts` | Keep as fallback, add unified interface |
| `src/types/domain.ts` | Add `embedding?: number[]` to KnowledgeNode |
| `src/types/schemas.ts` | Update schema for embedding field |
| `src/storage/FileStorage.ts` | Handle embedding persistence |
| `src/tools/core.ts` | Generate embedding on capture |
| `src/tools/search.ts` | Use stored embeddings for search |
| `src/tools/analysis.ts` | Use stored embeddings for kg_find_similar |
| `src/server.ts` | Initialize OpenAI client |
| `package.json` | Add `openai` dependency |

### Configuration

New environment variables:
```bash
# Required for OpenAI embeddings (optional - falls back to bag-of-words)
OPENAI_API_KEY=sk-...

# Optional: embedding model (default: text-embedding-3-small)
PKG_EMBEDDING_MODEL=text-embedding-3-small

# Optional: embedding dimensions (default: 1536 for text-embedding-3-small)
PKG_EMBEDDING_DIM=1536
```

### OpenAI Embedding Provider

```typescript
// src/utils/openai-embeddings.ts

import OpenAI from 'openai';

let client: OpenAI | null = null;

export function initOpenAI(apiKey?: string): boolean {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) return false;
  client = new OpenAI({ apiKey: key });
  return true;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!client) return null;

  try {
    const response = await client.embeddings.create({
      model: process.env.PKG_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text.slice(0, 8000), // Truncate to avoid token limits
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('[PKG] OpenAI embedding error:', error);
    return null;
  }
}

export function isOpenAIAvailable(): boolean {
  return client !== null;
}
```

### Updated Domain Types

```typescript
// src/types/domain.ts

export interface KnowledgeNode {
  id: string;
  type: (typeof KnowledgeNodeType)[number];
  content: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  createdAt: string;
  updatedAt: string;
  git?: GitContext;
  importance?: (typeof ImportanceLevel)[number];
  embedding?: number[];  // NEW: OpenAI embedding vector
}
```

### Unified Embedding Interface

```typescript
// src/utils/embeddings.ts (updated)

import { generateEmbedding as openaiEmbed, isOpenAIAvailable } from './openai-embeddings.js';

// Keep existing bag-of-words as fallback
export function embedTextLocal(text: string, dim = 256): Float32Array {
  // ... existing implementation ...
}

// Unified embedding function
export async function embedText(text: string): Promise<number[] | Float32Array> {
  if (isOpenAIAvailable()) {
    const embedding = await openaiEmbed(text);
    if (embedding) return embedding;
  }
  // Fallback to local bag-of-words
  return embedTextLocal(text);
}

// Sync version for compatibility (uses local only)
export function embedTextSync(text: string, dim = 256): Float32Array {
  return embedTextLocal(text, dim);
}

export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### Capture Flow Update

```typescript
// src/tools/core.ts (kg_capture handler)

async ({ content, type, tags, ... }) => {
  // Create node as before
  const node = storage.createNode({ content, type, tags, ... });

  // Generate and store embedding
  if (isOpenAIAvailable()) {
    const embedding = await generateEmbedding(content + ' ' + (tags || []).join(' '));
    if (embedding) {
      storage.updateNodeEmbedding(node.id, embedding);
    }
  }

  // Auto-link as before...
}
```

### Search Flow Update

```typescript
// src/tools/search.ts (kg_semantic_search handler)

async ({ query, limit }) => {
  const nodes = storage.listAllNodes();

  if (isOpenAIAvailable()) {
    // Use OpenAI for query embedding
    const queryEmb = await generateEmbedding(query);
    if (queryEmb) {
      // Compare against stored embeddings
      const scored = nodes
        .filter(n => n.embedding) // Only nodes with embeddings
        .map(n => ({
          node: n,
          score: cosineSimilarity(queryEmb, n.embedding!),
        }));
      scored.sort((a, b) => b.score - a.score);
      // ... return results
    }
  }

  // Fallback to local bag-of-words
  const q = embedTextSync(query);
  // ... existing logic
}
```

## Migration Strategy

### Phase 1: Add Infrastructure (Non-Breaking)
1. Add `openai` dependency
2. Create `openai-embeddings.ts`
3. Update types to include optional `embedding` field
4. Update FileStorage to persist embeddings

### Phase 2: Generate on Capture
1. Update `kg_capture` to generate embeddings
2. New nodes get embeddings automatically
3. Old nodes continue to work with fallback

### Phase 3: Backfill Existing Nodes
1. Add `kg_migrate_embeddings` tool
2. Batch process existing nodes
3. ~200 nodes × $0.00001 = ~$0.002 total cost

### Phase 4: Use for Search
1. Update `kg_semantic_search` to use stored embeddings
2. Update `kg_find_similar` to use stored embeddings
3. Update relationship scoring to use embeddings

## Acceptance Criteria

- [x] OpenAI embeddings generated on `kg_capture` when API key available
- [x] Embeddings persisted in node JSON files
- [x] `kg_semantic_search` uses stored embeddings when available
- [x] `kg_find_similar` uses stored embeddings when available
- [x] Graceful fallback to bag-of-words when OpenAI unavailable
- [x] Migration tool to backfill existing nodes
- [x] All existing tests pass
- [x] New tests for embedding generation and search

## Test Plan

1. **Unit tests:**
   - OpenAI embedding generation (mocked)
   - Fallback to bag-of-words when no API key
   - Embedding persistence in node files
   - Cosine similarity with different vector types

2. **Integration tests:**
   - Capture → embedding → search flow
   - Migration of existing nodes

3. **Manual verification:**
   - Run prototype queries and compare results
   - Verify search quality improvement

## Cost Analysis

**Per-capture cost:**
- ~500 tokens average per node
- text-embedding-3-small: $0.02/1M tokens
- Cost per capture: ~$0.00001

**Backfill cost (one-time):**
- ~200 existing nodes × 500 tokens = 100K tokens
- Cost: ~$0.002

**Monthly estimate:**
- ~100 captures/day × 30 days = 3000 captures
- Cost: ~$0.03/month

## Rollback Plan

1. Set `OPENAI_API_KEY` to empty to disable
2. System falls back to bag-of-words automatically
3. Existing embeddings in nodes are ignored (no data loss)

---

## Implementation Log

### 2026-01-19: Full Implementation Complete

**Files Created:**
- `src/utils/openai-embeddings.ts` - OpenAI embedding provider with batch support

**Files Modified:**
- `package.json` - Added `openai` dependency (^4.77.0)
- `src/types/domain.ts` - Added `embedding?: number[]` field to KnowledgeNode
- `src/types/schemas.ts` - Added embedding validation to KnowledgeNodeSchema
- `src/utils/embeddings.ts` - Unified interface with OpenAI and local fallback
- `src/storage/FileStorage.ts` - Added `updateNodeEmbedding()` method
- `src/server.ts` - Initialize OpenAI client on startup
- `src/tools/core.ts` - Generate embeddings on capture and update
- `src/tools/search.ts` - Use stored embeddings for semantic search
- `src/tools/analysis.ts` - Use stored embeddings for clustering
- `src/tools/maintenance.ts` - Added `migrate_embeddings` operation

**Tests Created:**
- `src/__tests__/openai-embeddings.test.ts` - 16 tests for embedding functionality

**Key Implementation Details:**
1. OpenAI embeddings are generated automatically on `kg_capture` when API key is present
2. Embeddings include both content and tags for better semantic matching
3. Semantic search falls back to local bag-of-words when no embeddings available
4. Search response includes `embeddingType` to indicate which method was used
5. Migration tool processes nodes in batches with progress logging
6. All 193 tests pass, including new embedding tests
