// Feature-detected, with a fallback the guest actually takes.
export const mode =
  typeof process !== "undefined" && process.env ? process.env.NODE_ENV : "sandbox";

export function describe() {
  return `running as ${mode ?? "sandbox"}`;
}
