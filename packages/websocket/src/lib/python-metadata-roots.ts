/**
 * Find the directories that hold `package_metadata` for installed
 * `nodetool-*` Python distributions, so the node registry can load their
 * node metadata without a running Python worker.
 *
 * Reads the distributions through `importlib.metadata` in one interpreter.
 * The previous form ran `pip list` and `pip show -f` in two child
 * interpreters, which cost about a second of blocked startup because pip
 * imports most of itself before printing anything.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const SCRIPT = `
import json, pathlib, sys
from importlib import metadata
roots = set()
for dist in metadata.distributions():
    name = (dist.metadata["Name"] or "").lower().replace("_", "-")
    if not name.startswith("nodetool-"):
        continue
    try:
        direct_url = json.loads(dist.read_text("direct_url.json") or "{}")
    except Exception:
        direct_url = {}
    if direct_url.get("dir_info", {}).get("editable"):
        url = direct_url.get("url", "")
        if url.startswith("file://"):
            from urllib.parse import unquote, urlparse
            from urllib.request import url2pathname
            roots.add(url2pathname(unquote(urlparse(url).path)))
    for rel in dist.files or []:
        if "package_metadata" not in str(rel).replace("\\\\", "/"):
            continue
        abs_path = pathlib.Path(dist.locate_file(rel)).resolve()
        roots.add(str(abs_path if abs_path.is_dir() else abs_path.parent))
print(json.dumps(sorted(roots)))
`;

interface DetectOptions {
  /** Interpreters tried in order. Default: `python3`, then `python`. */
  pythons?: readonly string[];
  env?: NodeJS.ProcessEnv;
}

function runScript(
  python: string,
  env: NodeJS.ProcessEnv | undefined
): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = "";
    let child;
    try {
      child = spawn(python, ["-c", SCRIPT], {
        env: env ?? process.env,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true
      });
    } catch {
      resolve(null);
      return;
    }
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 && stdout ? stdout : null));
  });
}

/**
 * Resolve the metadata roots of installed `nodetool-*` distributions. An
 * editable install contributes its project directory; a regular install
 * contributes each directory that holds a `package_metadata` file. Returns an
 * empty list when no interpreter answers.
 */
export async function detectPipMetadataRoots(
  options: DetectOptions = {}
): Promise<string[]> {
  for (const python of options.pythons ?? ["python3", "python"]) {
    const stdout = await runScript(python, options.env);
    if (stdout === null) {
      continue;
    }
    try {
      const roots: unknown = JSON.parse(stdout.trim());
      if (Array.isArray(roots)) {
        return roots.filter(
          (p): p is string => typeof p === "string" && p.length > 0 && existsSync(p)
        );
      }
    } catch {
      // Try the next interpreter.
    }
  }
  return [];
}
