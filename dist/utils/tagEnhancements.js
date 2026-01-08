/**
 * Tag Enhancement Utilities
 * Provides tag synonyms, hierarchies, and auto-suggestions
 */
/**
 * Default tag synonyms for common developer terms
 * Maps base term -> array of synonyms
 */
export const DEFAULT_TAG_SYNONYMS = {
    // Authentication & Authorization
    "auth": ["authentication", "login", "signin", "oauth", "jwt"],
    "authentication": ["auth", "login", "signin", "oauth", "jwt"],
    "login": ["auth", "authentication", "signin"],
    // Bugs & Issues
    "bug": ["issue", "defect", "problem", "error", "fault"],
    "issue": ["bug", "defect", "problem"],
    "error": ["bug", "issue", "exception", "failure"],
    // Performance
    "performance": ["perf", "optimization", "speed", "latency", "slow"],
    "perf": ["performance", "optimization", "speed"],
    "optimization": ["performance", "perf", "optimize"],
    "slow": ["performance", "latency", "speed"],
    // Database
    "database": ["db", "storage", "persistence", "sql", "data-layer"],
    "db": ["database", "storage", "sql"],
    "storage": ["database", "db", "persistence"],
    // API
    "api": ["endpoint", "rest", "service", "backend"],
    "endpoint": ["api", "rest", "route"],
    "rest": ["api", "endpoint", "rest-api"],
    // Testing
    "test": ["testing", "unit-test", "integration-test", "spec"],
    "testing": ["test", "unit-test", "qa"],
    // Frontend
    "frontend": ["ui", "ux", "client", "web"],
    "ui": ["frontend", "interface", "ux"],
    "ux": ["ui", "frontend", "user-experience"],
    // Backend
    "backend": ["server", "api", "service"],
    "server": ["backend", "service"],
    // Documentation
    "docs": ["documentation", "readme", "guide"],
    "documentation": ["docs", "readme", "guide"],
    // Configuration
    "config": ["configuration", "settings", "setup"],
    "configuration": ["config", "settings", "setup"],
    // Security
    "security": ["vulnerability", "exploit", "cve", "secure"],
    "vulnerability": ["security", "exploit", "vuln"],
};
/**
 * Default tag hierarchies
 * Parent tags automatically include their children
 */
export const DEFAULT_TAG_HIERARCHIES = [
    {
        parent: "backend",
        children: ["api", "database", "server", "auth"],
    },
    {
        parent: "frontend",
        children: ["ui", "ux", "component", "styling"],
    },
    {
        parent: "testing",
        children: ["unit-test", "integration-test", "e2e-test", "test-fix"],
    },
    {
        parent: "bug-fix",
        children: ["hotfix", "patch", "critical-fix"],
    },
    {
        parent: "performance",
        children: ["optimization", "caching", "lazy-loading", "bundling"],
    },
    {
        parent: "security",
        children: ["auth", "encryption", "vulnerability", "hardening"],
    },
];
/**
 * Expand a tag to include its synonyms
 * @param tag Base tag to expand
 * @param synonymMap Custom synonym map (defaults to DEFAULT_TAG_SYNONYMS)
 * @returns Array of the original tag plus all synonyms
 */
export function expandTagSynonyms(tag, synonymMap = DEFAULT_TAG_SYNONYMS) {
    const normalized = tag.toLowerCase();
    const synonyms = synonymMap[normalized] || [];
    return [normalized, ...synonyms];
}
/**
 * Expand multiple tags to include all synonyms (deduplicated)
 * @param tags Array of tags to expand
 * @param synonymMap Custom synonym map (defaults to DEFAULT_TAG_SYNONYMS)
 * @returns Deduplicated array of tags plus all synonyms
 */
export function expandTagsSynonyms(tags, synonymMap = DEFAULT_TAG_SYNONYMS) {
    const expanded = new Set();
    for (const tag of tags) {
        const synonyms = expandTagSynonyms(tag, synonymMap);
        for (const syn of synonyms) {
            expanded.add(syn);
        }
    }
    return Array.from(expanded);
}
/**
 * Get parent tags for a given tag based on hierarchies
 * @param tag Tag to find parents for
 * @param hierarchies Custom hierarchies (defaults to DEFAULT_TAG_HIERARCHIES)
 * @returns Array of parent tags
 */
export function getParentTags(tag, hierarchies = DEFAULT_TAG_HIERARCHIES) {
    const normalized = tag.toLowerCase();
    const parents = [];
    for (const hierarchy of hierarchies) {
        if (hierarchy.children.includes(normalized)) {
            parents.push(hierarchy.parent);
        }
    }
    return parents;
}
/**
 * Get child tags for a given tag based on hierarchies
 * @param tag Tag to find children for
 * @param hierarchies Custom hierarchies (defaults to DEFAULT_TAG_HIERARCHIES)
 * @returns Array of child tags
 */
export function getChildTags(tag, hierarchies = DEFAULT_TAG_HIERARCHIES) {
    const normalized = tag.toLowerCase();
    for (const hierarchy of hierarchies) {
        if (hierarchy.parent === normalized) {
            return [...hierarchy.children];
        }
    }
    return [];
}
/**
 * Expand tags to include hierarchical relationships
 * When searching for a parent tag, also include children
 * @param tags Tags to expand
 * @param hierarchies Custom hierarchies (defaults to DEFAULT_TAG_HIERARCHIES)
 * @returns Deduplicated array including children
 */
export function expandTagsHierarchical(tags, hierarchies = DEFAULT_TAG_HIERARCHIES) {
    const expanded = new Set(tags.map(t => t.toLowerCase()));
    for (const tag of tags) {
        const children = getChildTags(tag, hierarchies);
        for (const child of children) {
            expanded.add(child);
        }
    }
    return Array.from(expanded);
}
/**
 * Fully expand tags with both synonyms and hierarchies
 * @param tags Tags to expand
 * @param synonymMap Custom synonym map
 * @param hierarchies Custom hierarchies
 * @returns Fully expanded and deduplicated tag array
 */
export function expandTagsFull(tags, synonymMap = DEFAULT_TAG_SYNONYMS, hierarchies = DEFAULT_TAG_HIERARCHIES) {
    // First expand synonyms
    const withSynonyms = expandTagsSynonyms(tags, synonymMap);
    // Then expand hierarchies
    const withHierarchies = expandTagsHierarchical(withSynonyms, hierarchies);
    return withHierarchies;
}
/**
 * Auto-suggest tags based on content keywords
 * Analyzes content and suggests relevant tags
 * @param content Content to analyze
 * @param existingTags Already applied tags
 * @param limit Maximum number of suggestions
 * @returns Array of suggested tags
 */
export function suggestTags(content, existingTags = [], limit = 5) {
    const contentLower = content.toLowerCase();
    const existing = new Set(existingTags.map(t => t.toLowerCase()));
    const suggestions = new Map();
    // Check each synonym group for matches in content
    for (const [baseTag, synonyms] of Object.entries(DEFAULT_TAG_SYNONYMS)) {
        if (existing.has(baseTag))
            continue;
        let score = 0;
        // Check if base tag appears
        if (contentLower.includes(baseTag)) {
            score += 2;
        }
        // Check if any synonym appears
        for (const syn of synonyms) {
            if (contentLower.includes(syn)) {
                score += 1;
            }
        }
        if (score > 0) {
            suggestions.set(baseTag, score);
        }
    }
    // Sort by score and return top suggestions
    return Array.from(suggestions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag]) => tag);
}
