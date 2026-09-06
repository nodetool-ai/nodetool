/**
 * T13: the alpha bake is encoded as the timeline's own alpha format (§D6).
 *
 * `resolveTimelineOutput` in `@nodetool-ai/video-nodes` is where NodeTool
 * declares what a transparent video is — WebM, VP9, `yuva420p` — and a bake
 * has to be the same file a render of the same clip would be, or the clip
 * plays something the exporter would never write. `@nodetool-ai/blender-nodes`
 * cannot import that table (it does not depend on the video package, and a
 * bake needs four strings from it rather than a package), so it carries a copy
 * and this test is what keeps the copy true. It lives here because
 * `@nodetool-ai/agents` is the one package that depends on both.
 */

import { describe, expect, it } from "vitest";

import { bakeVideoFormat } from "@nodetool-ai/blender-nodes";
import { resolveTimelineOutput } from "@nodetool-ai/video-nodes/nodes/timeline/outputFormats";

/** The `-flag value` pair for `flag`, or undefined when it is absent. */
function argOf(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

describe("the bake's alpha format and the timeline renderer's", () => {
  it("name the same container, encoder and pixel format", () => {
    const declared = resolveTimelineOutput({ format: "webm", alpha: true });
    const bake = bakeVideoFormat(true);

    expect(bake.extension).toBe(declared.extension);
    expect(bake.mimeType).toBe(declared.mimeType);
    expect(argOf(bake.encoderArgs, "-c:v")).toBe(
      argOf(declared.encoderArgs, "-c:v")
    );
    expect(argOf(bake.encoderArgs, "-pix_fmt")).toBe(
      argOf(declared.encoderArgs, "-pix_fmt")
    );
    // And the pair is actually the alpha one, so a table that lost its alpha
    // format could not make this pass by agreeing with itself.
    expect(argOf(bake.encoderArgs, "-c:v")).toBe("libvpx-vp9");
    expect(argOf(bake.encoderArgs, "-pix_fmt")).toBe("yuva420p");
  });

  it("keeps the opaque bake on the opaque pixel format", () => {
    const bake = bakeVideoFormat(false);
    expect(bake.extension).toBe("mp4");
    expect(argOf(bake.encoderArgs, "-pix_fmt")).toBe("yuv420p");
  });
});
