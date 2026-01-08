/**
 * Tokenizes text with improved handling for technical terms
 * - Splits camelCase: "camelCase" -> "camel case"
 * - Splits PascalCase: "PascalCase" -> "pascal case"
 * - Splits numbers from text: "test123" -> "test 123"
 * - Handles snake_case: "snake_case" -> "snake case"
 */
export function tokenize(text) {
    return text
        // Split camelCase and PascalCase BEFORE lowercasing: "camelCase" -> "camel Case"
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        // Split consecutive capitals followed by lowercase: "XMLParser" -> "XML Parser"
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        // Convert to lowercase
        .toLowerCase()
        // Split lowercase followed by number: "test123" -> "test 123"
        .replace(/([a-z])([0-9])/g, "$1 $2")
        // Split number followed by lowercase: "123test" -> "123 test"
        .replace(/([0-9])([a-z])/g, "$1 $2")
        // Convert underscores and dashes to spaces
        .replace(/[_-]/g, " ")
        // Remove all other special characters
        .replace(/[^a-z0-9\s]/g, " ")
        // Split on whitespace and filter empty
        .split(/\s+/)
        .filter(Boolean);
}
// Minimal local embedding: bag-of-words hashing to a fixed-size vector
export function embedText(text, dim = 256) {
    const vec = new Float32Array(dim);
    const tokens = tokenize(text);
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
