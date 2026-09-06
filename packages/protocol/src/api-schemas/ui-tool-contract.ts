/**
 * One `ui_*` tool's contract — the name, the sentence the model reads, and the
 * Zod shape its arguments are parsed against — held once so both hosts read the
 * same thing.
 *
 * Two hosts register the same tool: the browser registry
 * (`web/src/lib/tools/builtin/*.ts`) and the headless eval bridges
 * (`packages/agents/src/evals/surfaces/*.ts`). They differ only in the host
 * field the browser adds — `timeline_id`, `document_id` — because the headless
 * bridge drives one implicit document. Everything else was copied by hand and
 * drifted: `ui_timeline_set_clip_params` accepted `startMs` headlessly and
 * silently stripped it in the browser, so the same call reported success and
 * changed nothing.
 *
 * `shape` is the field bag, not a finished schema, so a host can add its own
 * fields before the object is closed. `finalize` runs after that — it is where
 * `.strict()`, `.catchall()` and key remedies go, because each of those has to
 * see the host's fields to behave.
 */

import { z } from "zod";

export interface UiToolContract<S extends z.ZodRawShape = z.ZodRawShape> {
  description: string;
  shape: S;
  finalize?: (schema: z.ZodObject<z.ZodRawShape>) => z.ZodType;
}

/** The arguments a contract's handler receives once parsed. */
export type UiToolArgs<C extends UiToolContract> = z.infer<
  z.ZodObject<C["shape"]>
>;

/**
 * Build one host's parameter schema: the shared fields plus whatever that host
 * adds (`{ timeline_id }` in the browser, nothing headlessly).
 */
export function uiToolParams(
  contract: UiToolContract,
  hostFields: z.ZodRawShape = {}
): z.ZodType {
  const object = z.object({ ...hostFields, ...contract.shape });
  return contract.finalize ? contract.finalize(object) : object;
}

/** Close the object to unknown keys — the common `finalize`. */
export const strictParams = (schema: z.ZodObject<z.ZodRawShape>): z.ZodType =>
  schema.strict();
