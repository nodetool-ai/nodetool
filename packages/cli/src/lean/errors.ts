import { z } from "zod";

/** Preserve actionable feature identifiers at the process boundary. */
export function formatCliError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Command failed";
  const structured = z.object({ code: z.string(), featureIds: z.array(z.string()).optional() }).safeParse(error);
  if (structured.success) { return JSON.stringify({ ...structured.data, message }); }
  return message;
}
