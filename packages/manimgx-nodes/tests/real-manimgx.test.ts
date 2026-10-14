/**
 * The nodes against a real ManimGX. Skips when none is installed, unless
 * NODETOOL_REQUIRE_MANIMGX=1 makes a missing install a failure.
 */

import { createFakeContext, type FakeContextHandle } from "@nodetool-ai/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InspectSceneNode,
  RenderSceneNode,
  resetManimgxBinaryCache,
  resolveManimgxBinary
} from "../src/index.js";

async function manimgxAvailable(): Promise<boolean> {
  resetManimgxBinaryCache();
  try {
    await resolveManimgxBinary();
    return true;
  } catch (error) {
    if (process.env["NODETOOL_REQUIRE_MANIMGX"] === "1") throw error;
    return false;
  }
}

const available = await manimgxAvailable();

const CIRCLE = `import manimgx as m
from nodetool_inputs import inputs


class CircleArea(m.Scene):
    def construct(self) -> None:
        circle = m.Circle(radius=1, color=m.BLUE, fill_opacity=0.3)
        formula = m.MathTex(r"A = \\pi r^2").next_to(circle, m.RIGHT, buff=0.6)
        label = m.Text(inputs["title"]).to_edge(m.UP)
        logo = m.ImageMobject(inputs["logo"]).scale(0.5).to_corner(m.DL)
        m.VGroup(circle, formula).center()
        self.add(logo)
        self.play(m.Create(circle), m.Write(formula), m.Write(label))
        self.wait(0.5)
`;

const OVERLAP = `import manimgx as m


class Overlap(m.Scene):
    def construct(self) -> None:
        a = m.Text("Overlapping text here")
        b = m.Text("Another label").move_to(a)
        self.play(m.Write(a), m.Write(b))
`;

/** A 2x2 red PNG. */
const PNG_2X2 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

describe.skipIf(!available)("ManimGX nodes against a real manimgx", () => {
  let handle: FakeContextHandle;
  beforeAll(() => {
    handle = createFakeContext();
  });
  afterAll(() => handle.cleanup());

  it("renders a scene with wired inputs to an MP4 and a storyboard", async () => {
    const node = new RenderSceneNode();
    node.assign({ code: CIRCLE, width: 320, height: 180, fps: 15, preset: "ultrafast" });
    node.setDynamic("title", "Circle area");
    node.setDynamic("logo", { type: "image", uri: "", asset_id: null, data: PNG_2X2 });
    const result = await node.process(handle.context);
    const mp4 = Buffer.from(result.video.data, "base64");
    expect(mp4.subarray(4, 8).toString()).toBe("ftyp");
    expect(result.storyboard.length).toBeGreaterThan(0);
    expect(Buffer.from(result.storyboard[0].data, "base64").subarray(1, 4).toString()).toBe("PNG");
    expect(result.duration).toBeCloseTo(1.5, 1);
  }, 120000);

  it("inspects layout problems and a failing scene", async () => {
    const node = new InspectSceneNode();
    node.assign({ code: OVERLAP });
    const overlap = await node.process(handle.context);
    expect(overlap).toMatchObject({ ok: true, problems: true });
    expect(overlap.report).toMatch(/texts overlap/);

    node.assign({ code: "import manimgx as m\n\nclass Bad(m.Scene):\n    def construct(self):\n        self.play(m.Create(m.Circcle()))\n" });
    const failed = await node.process(handle.context);
    expect(failed.ok).toBe(false);
    expect(failed.report).toMatch(/Circcle/);
  }, 120000);
});
