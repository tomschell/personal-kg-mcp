function shouldIncludeContent(format, includeContent) {
    if (typeof includeContent === "boolean")
        return includeContent;
    return format === "full" || format === "summary";
}
function shouldIncludeTags(format, includeTags) {
    if (typeof includeTags === "boolean")
        return includeTags;
    return format === "full" || format === "summary";
}
function shouldIncludeMetadata(format, includeMetadata) {
    if (typeof includeMetadata === "boolean")
        return includeMetadata;
    return format === "full";
}
function truncate(text, maxLen) {
    if (maxLen <= 0)
        return "";
    if (text.length <= maxLen)
        return text;
    const sliced = text.slice(0, maxLen);
    // Attempt to avoid breaking surrogate pairs
    return /[\uD800-\uDBFF]$/.test(sliced) ? sliced.slice(0, -1) + "…" : sliced + "…";
}
/**
 * Returns a formatted representation of the node optimized for context usage,
 * respecting the include* flags and format mode. For 'summary' and 'minimal',
 * the 'content' field is truncated to summaryLength by default.
 */
export function formatNode(node, opts = {}) {
    const format = opts.format ?? "full";
    const includeContent = shouldIncludeContent(format, opts.includeContent);
    const includeTags = shouldIncludeTags(format, opts.includeTags);
    const includeMetadata = shouldIncludeMetadata(format, opts.includeMetadata);
    const summaryLength = Math.max(1, opts.summaryLength ?? 160);
    const base = {
        id: node.id,
        type: node.type,
    };
    if (includeContent) {
        const content = format === "full" ? node.content : truncate(node.content, summaryLength);
        base.content = content;
    }
    if (includeTags) {
        base.tags = Array.isArray(node.tags) ? node.tags : [];
    }
    if (includeMetadata) {
        base.visibility = node.visibility;
        base.createdAt = node.createdAt;
        base.updatedAt = node.updatedAt;
        if (node.importance)
            base.importance = node.importance;
        if (node.git)
            base.git = node.git;
    }
    return base;
}
export function formatNodes(nodes, opts = {}) {
    return nodes.map((n) => formatNode(n, opts));
}
