import { embedText, cosineSimilarity } from "./embeddings.js";
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
}
function extractKeywords(nodes, topK = 5) {
    const freq = new Map();
    for (const n of nodes) {
        for (const t of tokenize(n.content))
            freq.set(t, (freq.get(t) ?? 0) + 1);
        for (const tag of n.tags) {
            const key = tag.toLowerCase();
            if (key.length > 2)
                freq.set(key, (freq.get(key) ?? 0) + 2);
        }
    }
    const entries = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK)
        .map(([w]) => w);
    return entries;
}
function averageVectors(vectors) {
    if (vectors.length === 0)
        return new Float32Array(0);
    const dim = vectors[0].length;
    const acc = new Float32Array(dim);
    for (const v of vectors) {
        for (let i = 0; i < dim; i++)
            acc[i] += v[i];
    }
    for (let i = 0; i < dim; i++)
        acc[i] /= vectors.length;
    return acc;
}
export function clusterBySimilarity(nodes, similarityThreshold = 0.55) {
    if (nodes.length === 0)
        return [];
    const vecs = new Map();
    for (const n of nodes)
        vecs.set(n.id, embedText(n.content));
    const clusters = [];
    for (const n of nodes) {
        let bestIdx = -1;
        let bestSim = -1;
        for (let i = 0; i < clusters.length; i++) {
            const sim = cosineSimilarity(vecs.get(n.id), clusters[i].center);
            if (sim > bestSim) {
                bestSim = sim;
                bestIdx = i;
            }
        }
        if (bestIdx >= 0 && bestSim >= similarityThreshold) {
            const c = clusters[bestIdx];
            c.nodeIds.push(n.id);
            c.center = averageVectors(c.nodeIds.map((id) => vecs.get(id)));
        }
        else {
            clusters.push({ id: `cluster-${clusters.length + 1}`, nodeIds: [n.id], center: vecs.get(n.id) });
        }
    }
    const out = clusters.map((c) => {
        const members = nodes.filter((n) => c.nodeIds.includes(n.id));
        // coherence: average pairwise similarity inside cluster (fallback 1 for singletons)
        let pairSum = 0;
        let pairCnt = 0;
        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                pairSum += cosineSimilarity(vecs.get(members[i].id), vecs.get(members[j].id));
                pairCnt++;
            }
        }
        const coherence = members.length > 1 ? pairSum / pairCnt : 1;
        // center node: highest sum similarity to others
        let centerNode = members[0]?.id ?? c.nodeIds[0];
        let bestScore = -Infinity;
        for (const m of members) {
            let s = 0;
            for (const o of members)
                if (o.id !== m.id)
                    s += cosineSimilarity(vecs.get(m.id), vecs.get(o.id));
            if (s > bestScore) {
                bestScore = s;
                centerNode = m.id;
            }
        }
        const keywords = extractKeywords(members, 5);
        const name = keywords.slice(0, 3).join(" ") || "cluster";
        return {
            id: c.id,
            name,
            nodes: [...c.nodeIds],
            centerNode,
            coherenceScore: Number.isFinite(coherence) ? coherence : 0,
            keywords,
        };
    });
    return out.sort((a, b) => b.coherenceScore - a.coherenceScore);
}
