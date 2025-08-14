import { z } from "zod";
import { ImportanceLevel, KnowledgeNodeType } from "./enums.js";
export const GitContextSchema = z.object({
    repositoryPath: z.string(),
    currentBranch: z.string(),
    currentCommit: z.string(),
});
export const KnowledgeNodeSchema = z.object({
    id: z.string().min(1),
    type: z.enum(KnowledgeNodeType),
    content: z.string(),
    tags: z.array(z.string()),
    visibility: z.enum(["private", "team", "public"]),
    createdAt: z.string(),
    updatedAt: z.string(),
    git: GitContextSchema.optional(),
    importance: z.enum(ImportanceLevel).optional(),
});
export const KnowledgeEdgeSchema = z.object({
    id: z.string().min(1),
    fromNodeId: z.string().min(1),
    toNodeId: z.string().min(1),
    relation: z.enum([
        "references",
        "relates_to",
        "derived_from",
        "blocks",
        "duplicates",
    ]),
    createdAt: z.string(),
});
export const ExportPayloadSchema = z.object({
    nodes: z.array(KnowledgeNodeSchema),
    edges: z.array(KnowledgeEdgeSchema),
});
