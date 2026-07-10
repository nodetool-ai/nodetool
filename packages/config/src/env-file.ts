/**
 * Minimal `.env` file parser — a drop-in for the small subset of `dotenv`
 * we relied on. Node 22's `process.loadEnvFile()` can't override existing
 * `process.env` values, so we parse by hand.
 *
 * Supported syntax (matching dotenv where it matters in practice):
 * - `KEY=VALUE` pairs, one per line.
 * - Blank lines and `#` comment lines are skipped.
 * - An optional `export ` prefix on the key is stripped.
 * - Single- or double-quoted values; double-quoted values expand `\n`,
 *   `\r`, and `\t` escapes. Single-quoted values are taken literally.
 * - Unquoted values are trimmed, may contain `=`, and end at `#` comments.
 *   Hashes inside quoted values are preserved.
 *
 * Not supported (and not needed by callers): `dotenv-expand`-style
 * `${VAR}` interpolation.
 */

/** Parse the text of a `.env` file into key/value pairs. */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length)
      : line;

    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (key === "") continue;

    const rawValue = stripInlineComment(withoutExport.slice(eq + 1));
    result[key] = unquoteValue(rawValue);
  }
  return result;
}

function stripInlineComment(raw: string): string {
  const value = raw.trim();
  const quote = value[0];

  if (quote === "'" || quote === '"') {
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] === quote && value[index - 1] !== "\\") {
        const comment = value.indexOf("#", index + 1);
        return comment === -1 ? value : value.slice(0, comment).trim();
      }
    }
  }

  const comment = value.indexOf("#");
  return comment === -1 ? value : value.slice(0, comment).trim();
}

function unquoteValue(raw: string): string {
  if (raw.length >= 2) {
    const quote = raw[0];
    if ((quote === '"' || quote === "'") && raw[raw.length - 1] === quote) {
      const inner = raw.slice(1, -1);
      if (quote === '"') {
        return inner
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t");
      }
      return inner;
    }
  }
  return raw;
}

type FsApi = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: "utf8") => string;
};

/**
 * Read a `.env` file and apply its pairs to `process.env`, overriding any
 * existing values. Missing files are tolerated silently. Returns the parsed
 * pairs (empty when the file is absent).
 */
export function loadEnvFile(
  fs: FsApi,
  file: string
): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const parsed = parseEnvFile(fs.readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }
  return parsed;
}
