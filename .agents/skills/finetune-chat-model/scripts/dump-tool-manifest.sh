#!/usr/bin/env bash
# usage: dump-tool-manifest.sh <out.json>
#
# Writes the browser's full ui_* tool manifest, the list a real browser
# session registers with the server, for `ft-data.sh sample --manifest`.
# Without it a sampled prompt lists only the task's own tools and is shorter
# than a real session's, so traces and production disagree.
#
# The manifest is what FrontendToolRegistry.getManifest() returns once every
# built-in tool in web/src/lib/tools/builtin has registered. This script writes
# a temporary Jest test that dumps it, runs that test in web/, and deletes it.
# Regenerate the manifest whenever a ui_* tool changes, and use one manifest
# for a teacher's sampling and for every model evaluated against its data.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=${NODETOOL_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
out=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
test_file=$repo/web/src/lib/tools/__tests__/zzFinetuneManifestDump.tmp.test.ts
trap 'rm -f "$test_file"' EXIT
cat >"$test_file" <<'EOF'
/**
 * @jest-environment node
 */
// Temporary: written and deleted by the finetune-chat-model skill's dump-tool-manifest.sh.
import { writeFileSync } from "fs";
jest.mock("../../appNavigation", () => ({ navigateTo: jest.fn() }));
import { FrontendToolRegistry } from "../frontendTools";
import "../builtin";

it("dumps the browser tool manifest", () => {
  const manifest = FrontendToolRegistry.getManifest();
  writeFileSync(process.env.MANIFEST_OUT as string, JSON.stringify(manifest));
  expect(manifest.length).toBeGreaterThan(50);
});
EOF
cd "$repo/web"
unset DISPLAY
MANIFEST_OUT=$out npx jest --forceExit "$test_file" >&2
python3 -I -c '
import json, sys
m = json.load(open(sys.argv[1]))
ui = sum(t["name"].startswith("ui_") for t in m)
print(f"{len(m)} tools, {ui} of them ui_, {len(json.dumps(m))} characters -> {sys.argv[1]}")' "$out"
