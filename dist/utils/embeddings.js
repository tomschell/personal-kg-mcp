// Minimal local embedding: bag-of-words hashing to a fixed-size vector
export function embedText(text, dim = 256) {
    const vec = new Float32Array(dim);
    const tokens = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
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
export function cosineSimilarity(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++)
        s += a[i] * b[i];
    return s;
}
