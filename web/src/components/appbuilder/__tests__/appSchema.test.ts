import {
  parseAppSpec,
  createEmptyAppSpec,
  isRenderableAppSpec,
  APP_SPEC_VERSION,
  AppSpec
} from "../appSchema";

describe("appSchema", () => {
  describe("createEmptyAppSpec", () => {
    it("creates a versioned spec with no widgets", () => {
      const spec = createEmptyAppSpec("My App");
      expect(spec.version).toBe(APP_SPEC_VERSION);
      expect(spec.title).toBe("My App");
      expect(spec.widgets).toEqual([]);
      expect(spec.grid.cols).toBeGreaterThan(0);
    });
  });

  describe("parseAppSpec", () => {
    it("returns null for non-objects", () => {
      expect(parseAppSpec(null)).toBeNull();
      expect(parseAppSpec("nope")).toBeNull();
      expect(parseAppSpec(42)).toBeNull();
    });

    it("returns null when widgets is not an array", () => {
      expect(parseAppSpec({ version: 1, widgets: "x" })).toBeNull();
    });

    it("drops malformed widgets but keeps valid ones", () => {
      const parsed = parseAppSpec({
        widgets: [
          { id: "a", type: "text", layout: { x: 0, y: 0, w: 2, h: 1 }, props: {} },
          { id: "bad" }, // missing layout/props
          { type: "no-id", layout: { x: 0, y: 0, w: 1, h: 1 }, props: {} }
        ]
      });
      expect(parsed).not.toBeNull();
      expect(parsed!.widgets).toHaveLength(1);
      expect(parsed!.widgets[0].id).toBe("a");
    });

    it("fills grid defaults when missing", () => {
      const parsed = parseAppSpec({ widgets: [] });
      expect(parsed!.grid.cols).toBeGreaterThan(0);
      expect(parsed!.grid.rowHeight).toBeGreaterThan(0);
    });

    it("normalizes events to undefined when not an array", () => {
      const parsed = parseAppSpec({
        widgets: [
          {
            id: "a",
            type: "button",
            layout: { x: 0, y: 0, w: 2, h: 1 },
            props: {},
            events: "click"
          }
        ]
      });
      expect(parsed!.widgets[0].events).toBeUndefined();
    });
  });

  describe("isRenderableAppSpec", () => {
    it("is false for null and empty specs", () => {
      expect(isRenderableAppSpec(null)).toBe(false);
      expect(isRenderableAppSpec(createEmptyAppSpec())).toBe(false);
    });

    it("is true when there is at least one widget", () => {
      const spec: AppSpec = {
        ...createEmptyAppSpec(),
        widgets: [
          { id: "a", type: "text", layout: { x: 0, y: 0, w: 2, h: 1 }, props: {} }
        ]
      };
      expect(isRenderableAppSpec(spec)).toBe(true);
    });
  });
});
