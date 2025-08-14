export function findAutoLinks(nodes, content) {
    // Simple heuristic: link to nodes whose tags or content share words with new content
    const words = new Set(content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3));
    const matches = [];
    for (const n of nodes) {
        let score = 0;
        for (const t of n.tags)
            if (words.has(t.toLowerCase()))
                score += 2;
        for (const w of n.content.toLowerCase().split(/\s+/))
            if (words.has(w))
                score += 1;
        if (score > 2)
            matches.push({ id: n.id, score });
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 5).map((m) => m.id);
}
