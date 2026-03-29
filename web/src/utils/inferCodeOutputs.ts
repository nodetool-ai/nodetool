/**
 * Infer dynamic output slot names from the last `return { ... }` statement
 * in a JS/TS code string. Handles multiline objects and shorthand/longhand keys.
 *
 * Supports:
 *   return { a, b, c }
 *   return {
 *     foo,
 *     bar: someExpr,
 *     baz: fn(),
 *   }
 *   return { ["computed"]: x }  → skipped (computed keys)
 *
 * Returns null when no parseable return object is found (keeps existing outputs).
 */
export function inferReturnOutputs(code: string): string[] | null {
  // Strip single-line comments and block comments to avoid false matches
  const stripped = code
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Find the last `return {` in the code
  const returnIdx = stripped.lastIndexOf("return");
  if (returnIdx === -1) {return null;}

  const afterReturn = stripped.slice(returnIdx + 6).trimStart();
  if (!afterReturn.startsWith("{")) {return null;}

  // Extract the balanced brace block
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < afterReturn.length; i++) {
    const ch = afterReturn[i];
    if (ch === "{") {
      if (depth === 0) {start = i;}
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (start === -1 || end === -1) {return null;}

  const body = afterReturn.slice(start + 1, end);

  // Split on commas that are not inside nested braces/brackets/parens/strings
  const keys: string[] = [];
  let token = "";
  let nesting = 0;
  let inStr: string | null = null;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    // String tracking (simple — doesn't handle template literals perfectly but good enough)
    if (inStr) {
      token += ch;
      if (ch === inStr && body[i - 1] !== "\\") {inStr = null;}
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      token += ch;
      continue;
    }

    if (ch === "{" || ch === "[" || ch === "(") { nesting++; token += ch; continue; }
    if (ch === "}" || ch === "]" || ch === ")") { nesting--; token += ch; continue; }

    if (ch === "," && nesting === 0) {
      const key = extractKey(token.trim());
      if (key) {keys.push(key);}
      token = "";
    } else {
      token += ch;
    }
  }
  // Last token (no trailing comma)
  const lastKey = extractKey(token.trim());
  if (lastKey) {keys.push(lastKey);}

  return keys.length > 0 ? keys : null;
}

/**
 * From a key-value token like `foo`, `foo: expr`, `"str": expr` extract
 * the property name. Returns null for computed `[expr]: val` keys.
 */
function extractKey(token: string): string | null {
  if (!token) {return null;}
  // Skip computed keys
  if (token.startsWith("[")) {return null;}

  // key: value  or  shorthand key
  const colonIdx = token.indexOf(":");
  const rawKey = colonIdx === -1 ? token : token.slice(0, colonIdx);
  const key = rawKey.trim().replace(/^["']|["']$/g, ""); // strip quotes

  // Must be a valid JS identifier
  if (!key || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {return null;}
  return key;
}
