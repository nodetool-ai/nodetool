import { adjustmentFilter, outpaintPadding } from "../shotImageEdits";

describe("outpaintPadding", () => {
  it("grows the sides, split around the still, for a wider ratio", () => {
    expect(outpaintPadding(900, 900, "16:9")).toEqual({
      left: 350,
      right: 350,
      top: 0,
      bottom: 0
    });
  });

  it("grows the top and bottom for a taller ratio, giving the odd pixel to the bottom", () => {
    expect(outpaintPadding(1000, 1000, "4:5")).toEqual({
      left: 0,
      right: 0,
      top: 125,
      bottom: 125
    });
    expect(outpaintPadding(1001, 1000, "1:2")).toEqual({
      left: 0,
      right: 0,
      top: 501,
      bottom: 501
    });
    expect(outpaintPadding(1000, 999, "1:2")).toEqual({
      left: 0,
      right: 0,
      top: 500,
      bottom: 501
    });
  });

  it("adds nothing for the ratio the still already has, or one it cannot read", () => {
    const none = { left: 0, right: 0, top: 0, bottom: 0 };
    expect(outpaintPadding(1600, 900, "16:9")).toEqual(none);
    expect(outpaintPadding(1600, 900, "wide")).toEqual(none);
    expect(outpaintPadding(1600, 900, "0:9")).toEqual(none);
    expect(outpaintPadding(0, 900, "1:1")).toEqual(none);
  });
});

describe("adjustmentFilter", () => {
  it("is the CSS filter the preview and the saved take share", () => {
    expect(
      adjustmentFilter({ brightness: 110, contrast: 90, saturation: 100 })
    ).toBe("brightness(110%) contrast(90%) saturate(100%)");
  });
});
