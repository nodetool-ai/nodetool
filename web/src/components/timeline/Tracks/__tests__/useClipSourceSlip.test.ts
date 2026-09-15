import { slipSourceWindow } from "../useClipSourceSlip";

describe("slipSourceWindow", () => {
  const clip = {
    durationMs: 2000,
    inPointMs: 1000,
    outPointMs: 3000,
    speedMultiplier: 1
  };

  it("moves the source window without changing its span", () => {
    expect(slipSourceWindow(clip, 500, 10_000)).toEqual({
      inPointMs: 1500,
      outPointMs: 3500
    });
  });

  it("keeps the window within the source media", () => {
    expect(slipSourceWindow(clip, -2000, 10_000)).toEqual({
      inPointMs: 0,
      outPointMs: 2000
    });
    expect(slipSourceWindow(clip, 9000, 4000)).toEqual({
      inPointMs: 2000,
      outPointMs: 4000
    });
  });

  it("uses the source-rate span when the clip has no explicit out point", () => {
    expect(
      slipSourceWindow(
        { durationMs: 1000, inPointMs: 500, speedMultiplier: 2 },
        500,
        4000
      )
    ).toEqual({ inPointMs: 1000 });
  });
});
