import type { EvolveSettings } from "@/lib/evolveSettings";
import type { Program } from "@/types";

type EmbeddingSource = EvolveSettings["embeddingSource"];

/** Reject malformed vectors before they enter any embedding-based analysis. */
export function isUsableEmbedding(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  let norm = 0;
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return false;
    norm = Math.hypot(norm, item);
  }
  return Number.isFinite(norm) && norm > 0;
}

export function haveCompatibleDimensions(embeddings: number[][]): boolean {
  return embeddings.every(
    (embedding) =>
      isUsableEmbedding(embedding) &&
      embedding.length === embeddings[0]?.length,
  );
}

export function getActiveEmbedding(
  program: Program,
  source: EmbeddingSource,
): number[] | undefined {
  const embedding =
    source === "reasoning" ? program.reasoning_embedding : program.embedding;
  return isUsableEmbedding(embedding) ? embedding : undefined;
}

export function getActivePca2d(
  program: Program,
  source: EmbeddingSource,
): number[] | undefined {
  if (source === "reasoning" && !getActiveEmbedding(program, source))
    return undefined;
  const coordinates =
    source === "reasoning"
      ? program.reasoning_embedding_pca_2d
      : program.embedding_pca_2d;
  return Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    coordinates.every(Number.isFinite)
    ? coordinates
    : undefined;
}

export function getActiveClusterId(
  program: Program,
  source: EmbeddingSource,
): number | undefined {
  if (source === "reasoning" && !getActivePca2d(program, source))
    return undefined;
  const cluster =
    source === "reasoning"
      ? program.reasoning_embedding_cluster_id
      : program.embedding_cluster_id;
  return typeof cluster === "number" &&
    Number.isInteger(cluster) &&
    cluster >= 0
    ? cluster
    : undefined;
}
