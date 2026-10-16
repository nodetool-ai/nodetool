/**
 * Request helpers shared by the embeddings-only HTTP providers (Cohere, Jina,
 * Voyage).
 */

import { isNonEmptyString } from "@nodetool-ai/protocol";

/** Wrap a single string in an array and reject empty input. */
export function normalizeEmbeddingTexts(text: string | string[]): string[] {
  const texts = Array.isArray(text) ? text : [text];
  if (texts.length === 0 || texts.some((v) => !isNonEmptyString(v))) {
    throw new Error("text must not be empty");
  }
  return texts;
}

/** POST a JSON body with bearer auth and return the parsed response. */
export async function postEmbeddingRequest<T>(args: {
  fetchFn: typeof fetch;
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  /** Provider display name used in the HTTP error message. */
  label: string;
}): Promise<T> {
  const response = await args.fetchFn(args.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args.body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `${args.label} embedding error ${response.status}: ${errText}`
    );
  }

  return (await response.json()) as T;
}

/** Pure: order embedding rows by their `index` (default 0) and project them. */
export function sortEmbeddingsByIndex(
  rows: Array<{ embedding: number[]; index?: number }>
): number[][] {
  // Stryker disable next-line MethodExpression: defensive copy; removing it sorts in place but returns the same order.
  const ordered = rows.slice();
  return ordered
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => row.embedding);
}
