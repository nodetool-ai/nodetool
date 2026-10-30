import { describe, expect, it } from "vitest";

import { DEFAULT_YT_DLP_FORMAT, splitYtDlpFormat } from "../src/yt-dlp-format.js";

describe("splitYtDlpFormat", () => {
  it("keeps a selector with no + as one component", () => {
    expect(splitYtDlpFormat("best")).toEqual(["best"]);
    expect(splitYtDlpFormat("  bv*[height<=720]/b  ")).toEqual(["bv*[height<=720]/b"]);
  });

  it("splits on the top-level +", () => {
    expect(splitYtDlpFormat("bv*+ba")).toEqual(["bv*", "ba"]);
    expect(splitYtDlpFormat("bestvideo + bestaudio")).toEqual(["bestvideo", "bestaudio"]);
  });

  it("leaves / fallbacks inside their component for yt-dlp to resolve", () => {
    expect(splitYtDlpFormat(DEFAULT_YT_DLP_FORMAT)).toEqual(["bv*", "ba/b"]);
    expect(splitYtDlpFormat("bv[ext=mp4]/bv+ba[ext=m4a]/ba")).toEqual([
      "bv[ext=mp4]/bv",
      "ba[ext=m4a]/ba"
    ]);
  });

  it("does not split on a + inside a [filter], quoted or not", () => {
    expect(splitYtDlpFormat("bv[format_note*='a+b']+ba")).toEqual([
      "bv[format_note*='a+b']",
      "ba"
    ]);
    expect(splitYtDlpFormat('b[format_note="x+y]z"]')).toEqual(['b[format_note="x+y]z"]']);
    expect(splitYtDlpFormat("b[vcodec^=avc1+]")).toEqual(["b[vcodec^=avc1+]"]);
  });

  it("keeps a parenthesized group with fallbacks as one side", () => {
    expect(splitYtDlpFormat("(bv[height<=1080]/bv)+(ba[ext=m4a]/ba)")).toEqual([
      "(bv[height<=1080]/bv)",
      "(ba[ext=m4a]/ba)"
    ]);
    expect(splitYtDlpFormat("(bv/b)")).toEqual(["(bv/b)"]);
  });

  it("refuses a + inside parentheses, which only ffmpeg could merge", () => {
    expect(() => splitYtDlpFormat("(bv+ba)/b")).toThrow(/merges inside parentheses/);
  });

  it("refuses selectors it cannot split", () => {
    expect(() => splitYtDlpFormat("")).toThrow(/empty/);
    expect(() => splitYtDlpFormat("bv+")).toThrow(/empty side/);
    expect(() => splitYtDlpFormat("+ba")).toThrow(/empty side/);
    expect(() => splitYtDlpFormat("bv+ba+ba")).toThrow(/merges 3 formats/);
    expect(() => splitYtDlpFormat("bv+ba,b")).toThrow(/mixes "," and "\+"/);
    expect(() => splitYtDlpFormat("bv[height<=720+ba")).toThrow(/unclosed "\["/);
    expect(() => splitYtDlpFormat("(bv/b+ba")).toThrow(/unclosed "\("/);
    expect(() => splitYtDlpFormat("bv)+ba")).toThrow(/"\)" with no "\("/);
    expect(() => splitYtDlpFormat("bv]+ba")).toThrow(/"\]" with no "\["/);
  });

  it("allows a top-level , with no +", () => {
    expect(splitYtDlpFormat("bv,ba")).toEqual(["bv,ba"]);
  });
});
