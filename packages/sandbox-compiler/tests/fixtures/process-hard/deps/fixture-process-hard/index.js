// No guard, so the guest throws the moment this line runs. A local named
// `process` inside the helper must not be mistaken for the same reference.
export const mode = process.env.NODE_ENV ?? "production";

export function describe(process) {
  return `${process}: running as ${mode}`;
}
