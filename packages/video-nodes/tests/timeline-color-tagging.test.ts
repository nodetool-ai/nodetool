/**
 * Colour tagging on the render's ffmpeg args (A5.5).
 *
 * Frames leave the compositor as sRGB RGBA. Handed to ffmpeg with only a
 * `-pix_fmt`, they are converted with the BT.601 matrix and written untagged,
 * so every player that assumes BT.709 for HD shows a different picture than
 * the editor previewed. The fix is one conversion and three tags, and each
 * case below names the format it applies to — png_sequence carries RGBA and
 * must get neither.
 */
import { describe, expect, it } from "vitest";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";
import { defaultEncoderArgs } from "../src/nodes/timeline/rawFrames.js";

function args(request: Parameters<typeof resolveTimelineOutput>[0]): string {
  return resolveTimelineOutput(request).encoderArgs.join(" ");
}

describe("BT.709 tagging", () => {
  it("converts and tags mp4", () => {
    const a = args({ format: "mp4" });
    expect(a).toContain("-vf scale=out_color_matrix=bt709:out_range=tv");
    expect(a).toContain("-colorspace bt709");
    expect(a).toContain("-color_primaries bt709");
    expect(a).toContain("-color_trc bt709");
  });

  it("tags webm, with and without alpha", () => {
    expect(args({ format: "webm" })).toContain("-colorspace bt709");
    const alpha = args({ format: "webm", alpha: true });
    expect(alpha).toContain("-colorspace bt709");
    expect(alpha).toContain("-pix_fmt yuva420p");
  });

  it("tags ProRes, keeping the 4444 alpha profile", () => {
    const a = args({ format: "mov", alpha: true });
    expect(a).toContain("-colorspace bt709");
    expect(a).toContain("-profile:v 4444");
    expect(a).toContain("-pix_fmt yuva444p10le");
  });

  it("leaves a png sequence alone — it is RGBA, not YUV", () => {
    expect(resolveTimelineOutput({ format: "png_sequence" }).encoderArgs).toEqual(
      []
    );
  });

  it("tags the raw-frame encoder's own default too", () => {
    expect(defaultEncoderArgs().join(" ")).toContain("-colorspace bt709");
  });
});
