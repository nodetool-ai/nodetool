/**
 * Every `<video>` the web app renders has an accessible name.
 *
 * A screen reader announces an unnamed video as just "video", with nothing to
 * tell one clip from the next. Each raw `<video>` element therefore carries an
 * `aria-label` (or `aria-labelledby`), or `aria-hidden` when it is a still
 * inside a control that already names it. `VideoPlayer` takes a `label` prop
 * and falls back to "Video player"; its own test pins that.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === "__tests__" || entry === "node_modules" ? [] : walk(path);
    }
    return path.endsWith(".tsx") ? [path] : [];
  });

/** Drop block comments and whole-line `//` comments, which mention `<video>`. */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

/** The attribute block of each `<video ...>` opening tag in `source`. */
const videoTags = (raw: string): string[] => {
  const source = stripComments(raw);
  const tags: string[] = [];
  const re = /<video\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    // Walk to the closing `>` of the tag, skipping `>` inside `{...}`.
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
};

describe("video accessible names", () => {
  const files = walk(SRC);

  it("finds the raw video elements", () => {
    const count = files.reduce(
      (n, file) => n + videoTags(readFileSync(file, "utf8")).length,
      0
    );
    expect(count).toBeGreaterThan(5);
  });

  it("names every raw <video> element", () => {
    const unnamed = files.flatMap((file) =>
      videoTags(readFileSync(file, "utf8"))
        .filter((tag) => !/aria-(label|labelledby|hidden)\b/.test(tag))
        .map((tag) => `${relative(SRC, file)}: ${tag.split("\n")[0]}`)
    );
    expect(unnamed).toEqual([]);
  });
});
