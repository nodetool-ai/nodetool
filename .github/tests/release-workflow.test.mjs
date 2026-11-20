import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const { jobs } = parse(readFileSync(new URL("../workflows/release.yaml", import.meta.url), "utf8"));

test("desktop publishing depends only on the desktop release and preflight", () => {
  const publish = jobs["publish-release"];
  assert.deepEqual(publish.needs, ["preflight", "release-build"]);
  assert.doesNotMatch(publish.if, /native-timeline/);
  const download = publish.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
  for (const name of ["electron-ubuntu-latest", "nodetool-web", "nodetool-mcpb", "nodetool-sdk-contract"]) {
    assert.equal(matchesGlob(name, download.with.pattern), true, name);
  }
  assert.equal(matchesGlob("timeline-macos-arm64", download.with.pattern), false);
});

test("Timeline publishing requires successful Timeline builds and a published release", () => {
  const publish = jobs["publish-native-timeline"];
  assert.ok(publish.needs.includes("publish-release"));
  assert.ok(publish.needs.includes("native-timeline"));
  assert.match(publish.if, /needs\.publish-release\.result == 'success' && needs\.native-timeline\.result == 'success'/);
});
