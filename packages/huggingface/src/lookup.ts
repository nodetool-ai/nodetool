/**
 * Reading a lookup table with a key that only exists at runtime — a repo id, a
 * diffusers class name, an `hf.*` type coming off the CLI.
 *
 * The tables keep their inferred literal keys, which is what makes a typo in a
 * table entry a compile error; this is the one place a runtime string meets
 * them.
 */
export function tableLookup<TValue>(
  table: Readonly<Record<string, TValue>>,
  key: string
): TValue | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
