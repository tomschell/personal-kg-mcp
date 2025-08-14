/**
 * Simple ANN-like index facade. Currently implements exact top-K cosine search.
 * Structured to allow future swap with a real HNSW/FAISS backend without API changes.
 */
export class AnnIndex {
    dim;
    items = [];
    constructor(dim) {
        this.dim = dim;
    }
    build(initial = []) {
        this.items.length = 0;
        for (const r of initial)
            this.add(r.id, r.vector);
    }
    add(id, vector) {
        if (vector.length !== this.dim)
            return;
        this.items.push({ id, vector });
    }
    search(query, k) {
        if (query.length !== this.dim)
            return [];
        const scores = [];
        for (const it of this.items) {
            let s = 0;
            const a = query;
            const b = it.vector;
            for (let i = 0; i < a.length; i++)
                s += a[i] * b[i];
            scores.push({ id: it.id, score: s });
        }
        scores.sort((x, y) => y.score - x.score);
        return scores.slice(0, Math.max(0, k));
    }
}
