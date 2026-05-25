/**
 * Expand a leading `~` to the user home directory using platform path rules.
 * Avoids mixed separators on Windows (e.g. `C:\Users\x/my/cache`).
 */

import * as os from "node:os";
import * as path from "node:path";

export function expandLeadingTildePath(p: string): string {
  if (!p.startsWith("~")) {
    return p;
  }
  const tail = p.slice(1).replace(/^[\\/]+/, "");
  if (!tail) {
    return os.homedir();
  }
  const segments = tail.split(/[/\\]+/).filter((s) => s.length > 0);
  return path.join(os.homedir(), ...segments);
}
