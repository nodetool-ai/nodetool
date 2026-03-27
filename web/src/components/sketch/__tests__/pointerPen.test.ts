import {
  coalescedStrokePressure,
  normalizePointerPressure,
  pointerHasPaintContact
} from "../pointerPen";

describe("pointerPen", () => {
  describe("normalizePointerPressure", () => {
    it("preserves pen hover (pressure 0)", () => {
      expect(
        normalizePointerPressure({ pointerType: "pen", pressure: 0 })
      ).toBe(0);
    });

    it("preserves pen contact pressure", () => {
      expect(
        normalizePointerPressure({ pointerType: "pen", pressure: 0.4 })
      ).toBe(0.4);
    });

    it("uses 0.5 default for mouse when pressure is undefined", () => {
      expect(
        normalizePointerPressure({
          pointerType: "mouse",
          pressure: undefined
        } as PointerEvent)
      ).toBe(0.5);
    });

    it("preserves touch pressure including 0", () => {
      expect(
        normalizePointerPressure({ pointerType: "touch", pressure: 0 })
      ).toBe(0);
    });
  });

  describe("pointerHasPaintContact", () => {
    it("requires mouse primary button (left click)", () => {
      expect(
        pointerHasPaintContact({
          pointerType: "mouse",
          buttons: 0,
          pressure: 0
        })
      ).toBe(false);
      expect(
        pointerHasPaintContact({
          pointerType: "mouse",
          buttons: 1,
          pressure: 0.5
        })
      ).toBe(true);
    });

    it("rejects pen hover (no buttons, zero pressure)", () => {
      expect(
        pointerHasPaintContact({
          pointerType: "pen",
          buttons: 0,
          pressure: 0
        })
      ).toBe(false);
    });

    it("accepts pen with primary button", () => {
      expect(
        pointerHasPaintContact({
          pointerType: "pen",
          buttons: 1,
          pressure: 0
        })
      ).toBe(true);
    });

    it("rejects pen with proximity pressure but no primary button (hover)", () => {
      expect(
        pointerHasPaintContact({
          pointerType: "pen",
          buttons: 0,
          pressure: 0.2
        })
      ).toBe(false);
    });
  });

  describe("coalescedStrokePressure", () => {
    it("pen zero sample uses previous pressure when fallBack > 0", () => {
      const ep = {
        pointerType: "pen",
        pressure: 0
      } as PointerEvent;
      expect(coalescedStrokePressure(ep, 0.45)).toBe(0.45);
    });

    it("pen zero stays zero when there is no prior stroke pressure", () => {
      const ep = {
        pointerType: "pen",
        pressure: 0
      } as PointerEvent;
      expect(coalescedStrokePressure(ep, 0)).toBe(0);
    });

    it("falls back for mouse zero pressure", () => {
      const ep = {
        pointerType: "mouse",
        pressure: 0
      } as PointerEvent;
      expect(coalescedStrokePressure(ep, 0.35)).toBe(0.35);
    });

    it("touch zero sample reuses fallBack like pen", () => {
      const ep = {
        pointerType: "touch",
        pressure: 0
      } as PointerEvent;
      expect(coalescedStrokePressure(ep, 0.6)).toBe(0.6);
    });
  });
});
