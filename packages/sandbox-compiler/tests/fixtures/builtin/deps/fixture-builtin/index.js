import { readFileSync } from "node:fs";

export function readIt(path) {
  return readFileSync(path, "utf8");
}
