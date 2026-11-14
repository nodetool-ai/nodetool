import {
  DEFAULT_DOCKED_POSITION,
  dockPanelAt,
  parseDockedPosition,
  placeDockedPanel
} from "../dockedPanelPosition";

const area = { left: 50, top: 76, right: 1440, bottom: 868 };
const size = { width: 304, height: 70 };

describe("placeDockedPanel", () => {
  it("places the default at the area's top-left corner with the margin", () => {
    expect(placeDockedPanel(DEFAULT_DOCKED_POSITION, area, size)).toEqual({
      left: 66,
      top: 92
    });
  });

  it("measures right and bottom anchors from those edges", () => {
    expect(
      placeDockedPanel({ anchorX: "right", anchorY: "bottom", x: 20, y: 30 }, area, size)
    ).toEqual({ left: 1440 - 20 - 304, top: 868 - 30 - 70 });
  });

  it("keeps a right-docked panel at the right edge when the area narrows", () => {
    const narrow = { ...area, right: 900 };
    expect(
      placeDockedPanel({ anchorX: "right", anchorY: "top", x: 16, y: 16 }, narrow, size).left
    ).toBe(900 - 16 - 304);
  });

  it("clamps a stored offset that no longer fits back inside the area", () => {
    const small = { left: 0, top: 0, right: 400, bottom: 300 };
    expect(
      placeDockedPanel({ anchorX: "left", anchorY: "top", x: 900, y: 900 }, small, size)
    ).toEqual({ left: 400 - 16 - 304, top: 300 - 16 - 70 });
  });

  it("pins a panel larger than the area to its top-left so the header stays reachable", () => {
    const tiny = { left: 0, top: 0, right: 200, bottom: 50 };
    expect(
      placeDockedPanel({ anchorX: "right", anchorY: "bottom", x: 0, y: 0 }, tiny, size)
    ).toEqual({ left: 16, top: 16 });
  });
});

describe("dockPanelAt", () => {
  it("anchors to the nearer edges of each axis", () => {
    expect(dockPanelAt({ left: 1100, top: 760 }, area, size)).toEqual({
      anchorX: "right",
      anchorY: "bottom",
      x: 1440 - 1100 - 304,
      y: 868 - 760 - 70
    });
    expect(dockPanelAt({ left: 100, top: 120 }, area, size)).toEqual({
      anchorX: "left",
      anchorY: "top",
      x: 50,
      y: 44
    });
  });

  it("round-trips through placeDockedPanel", () => {
    const point = { left: 700, top: 300 };
    expect(placeDockedPanel(dockPanelAt(point, area, size), area, size)).toEqual(point);
  });

  it("clamps a drop outside the area before docking", () => {
    expect(dockPanelAt({ left: 5000, top: -400 }, area, size)).toEqual({
      anchorX: "right",
      anchorY: "top",
      x: 16,
      y: 16
    });
  });
});

describe("parseDockedPosition", () => {
  it("accepts a stored position", () => {
    expect(parseDockedPosition({ anchorX: "right", anchorY: "bottom", x: 4, y: 8 })).toEqual({
      anchorX: "right",
      anchorY: "bottom",
      x: 4,
      y: 8
    });
  });

  it.each([
    null,
    "left",
    { anchorX: "middle", anchorY: "top", x: 1, y: 1 },
    { anchorX: "left", anchorY: "top", x: "1", y: 1 },
    { anchorX: "left", anchorY: "top", x: Number.NaN, y: 1 }
  ])("rejects %p", (value) => {
    expect(parseDockedPosition(value)).toBeNull();
  });
});
