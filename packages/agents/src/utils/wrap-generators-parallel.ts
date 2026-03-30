/**
 * wrapGeneratorsParallel — T-AG-8.
 *
 * Merges multiple async generators into one, yielding items in arrival order.
 */

/**
 * Yield items from all generators concurrently in arrival order.
 * Uses Promise.race to return whichever generator produces a value first.
 */
export async function* wrapGeneratorsParallel<T>(
  generators: AsyncGenerator<T>[],
): AsyncGenerator<T> {
  if (generators.length === 0) return;

  type Slot = {
    gen: AsyncGenerator<T>;
    promise: Promise<{ index: number; result: IteratorResult<T> }>;
    index: number;
    done: boolean;
  };

  const slots: Slot[] = generators.map((gen, index) => {
    const slot: Slot = {
      gen,
      index,
      done: false,
      promise: gen.next().then((result) => ({ index, result })),
    };
    return slot;
  });

  while (true) {
    const activeSlots = slots.filter((s) => !s.done);
    if (activeSlots.length === 0) break;

    const { index, result } = await Promise.race(
      activeSlots.map((s) => s.promise),
    );

    const slot = slots[index];
    if (result.done) {
      slot.done = true;
    } else {
      yield result.value;
      // Advance this generator
      slot.promise = slot.gen.next().then((r) => ({ index, result: r }));
    }
  }
}
