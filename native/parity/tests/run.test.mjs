import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";
import { compareIntents, pixelDelta, rankNext } from "../run.mjs";

const dir = mkdtempSync(join(tmpdir(), "parity-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const square = async (name, colour, inset) => {
    const path = join(dir, name);
    const base = sharp({ create: { width: 200, height: 100, channels: 3, background: "#111111" } });
    const overlays = inset ? [{ input: { create: { width: 80, height: 40, channels: 3, background: colour } }, left: 20, top: 20 }] : [];
    await base.composite(overlays).png().toFile(path);
    return path;
};

test("identical screenshots have no differing tiles", async () => {
    const a = await square("a.png", "#ffffff", true);
    assert.equal(await pixelDelta(a, a), 0);
});

test("a missing element changes the tiles it covered", async () => {
    const a = await square("b.png", "#ffffff", true);
    const b = await square("c.png", "#ffffff", false);
    const delta = await pixelDelta(a, b);
    assert.ok(delta > 0.1, `delta ${delta}`);
});

test("Qt intents compare through the intent map", () => {
    const qt = [{ intent: "NodeCatalog.addRequested", args: ["nodetool.text.Concat"] }];
    const map = { "NodeCatalog.addRequested": "addNode" };
    assert.equal(compareIntents(qt, [{ intent: "addNode", args: ["nodetool.text.Concat"] }], map).match, true);
    assert.equal(compareIntents(qt, [{ intent: "addNode", args: ["nodetool.text.Split"] }], map).match, false);
    assert.equal(compareIntents(qt, [{ intent: "addNode", args: ["nodetool.text.Concat"] }], {}).match, false);
});

test("wrong intents rank before wrong state and pixel differences", () => {
    const next = rankNext([{ id: "s", component: "C", checks: [
        { layer: "pixels", match: false }, { layer: "state", match: false }, { layer: "intent", match: false }, { layer: "state", match: true }
    ] }]);
    assert.deepEqual(next.map((c) => c.layer), ["intent", "state", "pixels"]);
});
