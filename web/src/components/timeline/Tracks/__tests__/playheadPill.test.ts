import { pillShiftPx } from "../Playhead";

describe("pillShiftPx", () => {
  it("keeps a centred pill where it fits", () => {
    expect(pillShiftPx(400, 80, 1000)).toBe(0);
  });

  it("moves the pill right at the left edge so it is not cut in half", () => {
    expect(pillShiftPx(0, 80, 1000)).toBe(40);
    expect(pillShiftPx(10, 80, 1000)).toBe(30);
  });

  it("moves the pill left at the right edge", () => {
    expect(pillShiftPx(1000, 80, 1000)).toBe(-40);
  });

  it("leaves the pill with a line outside the viewport", () => {
    expect(pillShiftPx(-5, 80, 1000)).toBe(0);
    expect(pillShiftPx(1005, 80, 1000)).toBe(0);
  });

  it("does nothing before the widths are measured", () => {
    expect(pillShiftPx(0, 0, 1000)).toBe(0);
    expect(pillShiftPx(0, 80, 0)).toBe(0);
  });
});
