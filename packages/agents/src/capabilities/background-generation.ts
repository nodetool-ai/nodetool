import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Background generations a run may have open at once. */
export const MAX_BACKGROUND_GENERATIONS = 16;

const openBackground = new WeakMap<ProcessingContext, Set<Promise<void>>>();

export function backgroundGenerationLimitError(): { error: string } {
  return {
    error: `${MAX_BACKGROUND_GENERATIONS} background generations are already open on this run. Collect one with await_generation before starting another.`
  };
}

/**
 * Reserve one background-generation slot until its work settles.
 *
 * The count belongs to the context, rather than one capability module, so a
 * render cannot evade the same per-run limit that bounds provider media calls.
 */
export function startBackgroundGeneration(
  context: ProcessingContext,
  work: () => Promise<unknown>
): boolean {
  let open = openBackground.get(context);
  if (!open) {
    open = new Set();
    openBackground.set(context, open);
  }
  if (open.size >= MAX_BACKGROUND_GENERATIONS) return false;

  const running: Promise<void> = work()
    .then(
      () => undefined,
      () => {
        // The generation seam records the terminal failure.
      }
    )
    .finally(() => {
      open.delete(running);
    });
  open.add(running);
  return true;
}

/**
 * Resolve once every background generation open on `context` has settled,
 * including any started while waiting. A host that stops listening to the
 * context's messages before then loses their terminal messages, and the
 * generation rows stay "running".
 */
export async function whenBackgroundGenerationsSettle(
  context: ProcessingContext
): Promise<void> {
  const open = openBackground.get(context);
  while (open && open.size > 0) {
    await Promise.all([...open]);
  }
}
