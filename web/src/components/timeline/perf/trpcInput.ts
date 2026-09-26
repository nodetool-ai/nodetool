/** Read a query id from tRPC's indexed HTTP batch request input. */
export function readTrpcBatchId(input: unknown, index: number): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const batchEntry = (input as Record<string, unknown>)[String(index)];
  if (typeof batchEntry !== "object" || batchEntry === null || Array.isArray(batchEntry)) {
    return undefined;
  }
  const entry = batchEntry as Record<string, unknown>;
  const candidate = entry.id;
  if (typeof candidate === "string") return candidate;
  if (typeof entry.json !== "object" || entry.json === null || Array.isArray(entry.json)) {
    return undefined;
  }
  const wrappedId = (entry.json as Record<string, unknown>).id;
  return typeof wrappedId === "string" ? wrappedId : undefined;
}
