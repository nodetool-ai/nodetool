import { z } from "zod";

/** Preserve actionable feature identifiers at the process boundary. */
export function formatCliError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Command failed";
  const structured = cliFailureSchema.safeParse(error);
  if (structured.success) { return JSON.stringify({ ...structured.data, message }); }
  return message;
}

export const cliFailureSchema = z.object({
    code: z.string(),
    featureIds: z.array(z.string()).optional(),
    recovery: z.array(z.object({
      featureId: z.string(), packId: z.string().nullable(), packageName: z.string(),
      installCommand: z.string(), adapterInstallCommand: z.string().optional(), configuration: z.string(), restart: z.string(), authorizationRequired: z.literal(true)
    })).optional(),
    validation_issues: z.array(z.record(z.string(), z.unknown())).optional()
  });
