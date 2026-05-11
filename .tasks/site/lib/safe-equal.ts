// Constant-time string equality. Works on the Edge runtime (no
// node:crypto.timingSafeEqual) and on Node. Inputs must be strings;
// length mismatch returns false immediately, which is fine for our
// fixed-length tokens — attackers can already learn length from the
// auth payload shape.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
