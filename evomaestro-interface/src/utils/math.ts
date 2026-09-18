import { isUsableEmbedding } from "@/utils/embeddingAccessors";

export function cosineSimilarity(
  vecA: number[],
  vecB: number[],
): number | null {
  if (
    !isUsableEmbedding(vecA) ||
    !isUsableEmbedding(vecB) ||
    vecA.length !== vecB.length
  )
    return null;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    normA = Math.hypot(normA, vecA[i]);
    normB = Math.hypot(normB, vecB[i]);
  }
  let similarity = 0;
  for (let i = 0; i < vecA.length; i++) {
    similarity += (vecA[i] / normA) * (vecB[i] / normB);
  }
  return Math.max(-1, Math.min(1, similarity));
}

export function computeSimilarityMatrix(embeddings: number[][]): number[][] {
  const n = embeddings.length;
  const matrix = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      // Compute upper triangle and mirror
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim === null)
        throw new Error(
          "Similarity matrix requires usable embeddings with matching dimensions.",
        );
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }
  return matrix;
}
