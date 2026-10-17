/**
 * Guards the icon rules in docs/DESIGN.md ("Icons"): one variant per role and
 * no direct trash.svg imports outside DeleteButton.
 */
import fs from "fs";
import path from "path";
import { ICON_SIZE, MENU_ICON_SIZE } from "..";

const SRC_ROOT = path.resolve(__dirname, "../../..");
// The game editor has its own CI gate and is out of scope here.
const EXCLUDED_DIRS = [path.join(SRC_ROOT, "components", "game")];

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || EXCLUDED_DIRS.includes(full)) {
        return [];
      }
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

// This file names the forbidden patterns, so it is not scanned.
const files = sourceFiles(SRC_ROOT).filter((file) => file !== __filename);

const offenders = (pattern: RegExp, allow: string[] = []): string[] =>
  files
    .filter((file) => !allow.includes(path.relative(SRC_ROOT, file)))
    .filter((file) => pattern.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(SRC_ROOT, file));

describe("icon conventions", () => {
  it("scans the web source tree", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("uses the outlined variant for delete, close, add, folder, edit and info", () => {
    const filledOrRounded =
      /"@mui\/icons-material\/(Delete|Close|Add|Folder|Edit|Info)(Rounded)?"/;
    expect(offenders(filledOrRounded)).toEqual([]);
  });

  it("only DeleteButton imports icons/trash.svg", () => {
    expect(
      offenders(/icons\/trash\.svg/, [
        path.join("components", "ui_primitives", "DeleteButton.tsx")
      ])
    ).toEqual([]);
  });

  it("keeps the icon size scale and menu icon size in step", () => {
    expect(ICON_SIZE).toEqual({ xs: 14, sm: 16, md: 18, lg: 20 });
    expect(MENU_ICON_SIZE).toBe(ICON_SIZE.sm);
  });
});
