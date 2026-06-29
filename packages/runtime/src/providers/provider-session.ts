/** Stable, dependency-free 32-bit hash (FNV-1a) of a provider system prompt. */
export function hashSystemPrompt(prompt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
