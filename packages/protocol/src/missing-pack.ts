import { z } from "zod";

export const missingPackInstallSchema = z.discriminatedUnion("supported", [
  z.object({ supported: z.literal(true), reason: z.null(), command: z.string().nullable() }),
  z.object({ supported: z.literal(false), reason: z.string(), command: z.null() })
]);
export type MissingPackInstall = z.infer<typeof missingPackInstallSchema>;

export const missingPackDetailsSchema = z.object({
  error: z.literal("missing_pack"),
  packs: z.array(z.object({
    id: z.string(), npm: z.string(), version: z.string(), installBytes: z.number().nonnegative(), requires: z.array(z.string()).readonly()
  }).readonly()).readonly(),
  runtimeLibraries: z.array(z.string()).readonly(),
  nodeTypes: z.array(z.string()).readonly(),
  install: missingPackInstallSchema,
  restartRequired: z.boolean()
});
export type MissingPackDetails = z.infer<typeof missingPackDetailsSchema>;

/** Describe the absent packs and the install guidance for this host. */
export function missingPackText(details: MissingPackDetails): string {
  const guidance = details.install.reason ?? details.install.command;
  return `Node pack ${details.packs.map((pack) => pack.id).join(", ")} is not installed.${guidance ? ` ${guidance}` : ""}`;
}

/** A transportable refusal raised before executing an unavailable node pack. */
export class MissingPackError extends Error {
  override readonly name = "MissingPackError";
  readonly details: MissingPackDetails;

  constructor(details: MissingPackDetails) {
    super(missingPackText(details));
    this.details = details;
  }
}

/** Recover missing-pack details across wrappers and serialized transport boundaries. */
export function missingPackDetailsOf(error: unknown): MissingPackDetails | null {
  const seen = new Set<unknown>();
  let current = error;
  while (!seen.has(current)) {
    seen.add(current);
    const direct = missingPackDetailsSchema.safeParse(current);
    if (direct.success) { return direct.data; }
    const wrapper = missingPackWrapperSchema.safeParse(current);
    if (!wrapper.success) { return null; }
    const parsed = missingPackDetailsSchema.safeParse(wrapper.data.details);
    if (parsed.success) { return parsed.data; }
    current = wrapper.data.cause;
  }
  return null;
}

const missingPackWrapperSchema = z.object({ details: z.unknown().optional(), cause: z.unknown().optional() });
