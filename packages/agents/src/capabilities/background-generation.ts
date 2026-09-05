import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Background generations a run may have open at once. */
export const MAX_BACKGROUND_GENERATIONS = 16;

const openBackground = new WeakMap<ProcessingContext, number>();

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
  const open = openBackground.get(context) ?? 0;
  if (open >= MAX_BACKGROUND_GENERATIONS) return false;

  openBackground.set(context, open + 1);
  void work()
    .catch(() => {
      // The generation seam records the terminal failure.
    })
    .finally(() => {
      openBackground.set(
        context,
        Math.max(0, (openBackground.get(context) ?? 1) - 1)
      );
    });
  return true;
}
