export function buildTagCooccurrence(nodes) {
    const co = new Map();
    for (const n of nodes) {
        const tags = Array.from(new Set(n.tags.map((t) => t.toLowerCase())));
        for (let i = 0; i < tags.length; i++) {
            for (let j = 0; j < tags.length; j++) {
                if (i === j)
                    continue;
                const a = tags[i];
                const b = tags[j];
                if (!co.has(a))
                    co.set(a, new Map());
                const m = co.get(a);
                m.set(b, (m.get(b) ?? 0) + 1);
            }
        }
    }
    return co;
}
export function expandTags(baseTags, co, limit = 5) {
    const scores = new Map();
    for (const t of baseTags.map((x) => x.toLowerCase())) {
        const m = co.get(t);
        if (!m)
            continue;
        for (const [other, count] of m)
            scores.set(other, (scores.get(other) ?? 0) + count);
    }
    const ranked = Array.from(scores.entries())
        .filter(([t]) => !baseTags.includes(t))
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(0, limit))
        .map(([t]) => t);
    return ranked;
}
