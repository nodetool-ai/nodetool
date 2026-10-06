import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createTopDownRoomGame } from "../src/sample.js";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";

const fixture = new URL(
  "fixtures/system-pipeline-characterization.json",
  import.meta.url
);
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
it("preserves the pre-pipeline bytes of snapshots, frames and gameplay events", async () => {
  const flat = createGameSession(createTopDownRoomGame("pipeline-2d"), 7);
  const spatial = await createGameSession3D(
    createNative3DGame("pipeline-3d"),
    7
  );
  try {
    const records: { flat: string; spatial: string }[] = [];
    for (let tick = 0; tick < 40; tick++) {
      const result2d = flat.step({
        pressed: tick < 20 ? ["right"] : ["up"],
        justPressed: []
      });
      const result3d = spatial.step({
        pressed: [],
        justPressed: tick === 15 ? ["jump"] : [],
        axes: { moveX: 0.4, moveZ: -0.3 },
        look: { x: 0.01, y: 0 }
      });
      records.push({
        flat: hash({
          snapshot: flat.snapshot(),
          frame: result2d.frame,
          events: result2d.events
        }),
        spatial: hash({
          snapshot: spatial.snapshot(),
          frame: result3d.frame,
          events: result3d.events
        })
      });
    }
    if (process.env["UPDATE_PIPELINE_CHARACTERIZATION"] === "1") {
      await writeFile(fixture, `${JSON.stringify(records, null, 2)}\n`);
    }
    expect(records).toEqual(JSON.parse(await readFile(fixture, "utf8")));
  } finally {
    flat.dispose();
    spatial.dispose();
  }
});
