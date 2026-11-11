// QuickJS has no Encoding API. Use the standards polyfill for replacement,
// streaming, BOM handling, and typed-array offsets.
import encoding from "text-encoding";

globalThis.TextEncoder ??= encoding.TextEncoder;
globalThis.TextDecoder ??= encoding.TextDecoder;
