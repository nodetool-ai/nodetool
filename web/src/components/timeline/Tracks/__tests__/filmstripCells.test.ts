import type { ClipThumbnail } from "../clipThumbnails";
import {
  beyondSourceFraction,
  clipSourceWindow,
  selectFilmstripCells
} from "../filmstripCells";

/** 24 samples spread uniformly over a 23 s source: frame k at k seconds. */
const thumbnails: ClipThumbnail[] = Array.from({ length: 24 }, (_, k) => ({
  time: k,
  dataUrl: `frame-${k}`
}));

const urls = (cells: { url: string }[]) => cells.map((c) => c.url);

describe("selectFilmstripCells", () => {
  it("spreads an untrimmed clip uniformly over the whole source", () => {
    expect(
      urls(selectFilmstripCells(thumbnails, 4, 0, 23_000))
    ).toEqual(["frame-0", "frame-8", "frame-15", "frame-23"]);
  });

  it("starts at the in-point when the clip is trimmed", () => {
    expect(
      urls(selectFilmstripCells(thumbnails, 3, 10_000, 20_000))
    ).toEqual(["frame-10", "frame-15", "frame-20"]);
  });

  it("repeats the in-point frame for a single cell", () => {
    expect(urls(selectFilmstripCells(thumbnails, 1, 7_000, 12_000))).toEqual([
      "frame-7"
    ]);
  });

  it("picks the nearest sample when the target falls between two", () => {
    // 4 cells over [0, 10 s]: targets 0, 3.33, 6.67, 10.
    expect(
      urls(selectFilmstripCells(thumbnails, 4, 0, 10_000))
    ).toEqual(["frame-0", "frame-3", "frame-7", "frame-10"]);
  });

  it("clamps to the last frame past the source end", () => {
    expect(urls(selectFilmstripCells(thumbnails, 2, 20_000, 40_000))).toEqual([
      "frame-20",
      "frame-23"
    ]);
  });

  it("returns nothing without thumbnails or cells", () => {
    expect(selectFilmstripCells([], 4, 0, 1000)).toEqual([]);
    expect(selectFilmstripCells(thumbnails, 0, 0, 1000)).toEqual([]);
  });
});

describe("clipSourceWindow", () => {
  it("derives the out-point from duration and speed when unset", () => {
    expect(
      clipSourceWindow({ inPointMs: 1000, durationMs: 4000, speedMultiplier: 2 })
    ).toEqual({ inPointMs: 1000, outPointMs: 9000 });
  });

  it("plays 1:1 once the speed is baked", () => {
    expect(
      clipSourceWindow({
        durationMs: 4000,
        speedMultiplier: 2,
        speedBaked: true
      })
    ).toEqual({ inPointMs: 0, outPointMs: 4000 });
  });

  it("prefers an explicit out-point", () => {
    expect(
      clipSourceWindow({ inPointMs: 500, outPointMs: 2500, durationMs: 9999 })
    ).toEqual({ inPointMs: 500, outPointMs: 2500 });
  });
});

describe("beyondSourceFraction", () => {
  it("is zero while the clip ends inside the source", () => {
    // Estimated source end: 23 s + 1 s interval = 24 s.
    expect(beyondSourceFraction(thumbnails, 0, 24_000)).toBe(0);
    expect(beyondSourceFraction(thumbnails, 5_000, 12_000)).toBe(0);
  });

  it("is the share of the clip past the estimated source end", () => {
    // [20 s, 28 s] is 8 s wide; 4 s of it lie past 24 s.
    expect(beyondSourceFraction(thumbnails, 20_000, 28_000)).toBeCloseTo(0.5);
  });

  it("caps at the whole clip and needs two samples to estimate", () => {
    expect(beyondSourceFraction(thumbnails, 30_000, 40_000)).toBe(1);
    expect(beyondSourceFraction([thumbnails[0]], 0, 99_000)).toBe(0);
  });
});
