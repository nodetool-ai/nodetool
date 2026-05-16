import { CoordinateMapper } from "../CoordinateMapper";
import type { AffineTransform } from "../../types";

const identity: AffineTransform = {
  kind: "affine",
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0
};

describe("CoordinateMapper", () => {
  describe("translation-only (no matrix)", () => {
    it("maps doc to layer with no offset", () => {
      const mapper = new CoordinateMapper({ layerTransform: identity });
      const result = mapper.docToLayer({ x: 10, y: 20 });
      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
    });

    it("maps layer to doc with no offset", () => {
      const mapper = new CoordinateMapper({ layerTransform: identity });
      const result = mapper.layerToDoc({ x: 10, y: 20 });
      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
    });

    it("subtracts layer transform for docToLayer", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 100,
        y: 50,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
      const mapper = new CoordinateMapper({ layerTransform: transform });
      const result = mapper.docToLayer({ x: 150, y: 80 });
      expect(result.x).toBe(50);
      expect(result.y).toBe(30);
    });

    it("adds layer transform for layerToDoc", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 100,
        y: 50,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
      const mapper = new CoordinateMapper({ layerTransform: transform });
      const result = mapper.layerToDoc({ x: 50, y: 30 });
      expect(result.x).toBe(150);
      expect(result.y).toBe(80);
    });

    it("accounts for rasterBounds offset", () => {
      const mapper = new CoordinateMapper({
        layerTransform: identity,
        rasterBounds: { x: 10, y: 20 }
      });
      const result = mapper.docToLayer({ x: 30, y: 50 });
      expect(result.x).toBe(20);
      expect(result.y).toBe(30);
    });

    it("round-trips docToLayer and layerToDoc", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 42,
        y: -17,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
      const mapper = new CoordinateMapper({
        layerTransform: transform,
        rasterBounds: { x: 5, y: 8 }
      });
      const original = { x: 100, y: 200 };
      const layerPt = mapper.docToLayer(original);
      const roundTrip = mapper.layerToDoc(layerPt);
      expect(roundTrip.x).toBeCloseTo(original.x);
      expect(roundTrip.y).toBeCloseTo(original.y);
    });
  });

  describe("with scale/rotation (affine matrix path)", () => {
    it("applies scale in docToLayer", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 0,
        y: 0,
        scaleX: 2,
        scaleY: 2,
        rotation: 0
      };
      const mapper = new CoordinateMapper({ layerTransform: transform });
      const result = mapper.docToLayer({ x: 20, y: 40 });
      expect(result.x).toBeCloseTo(10);
      expect(result.y).toBeCloseTo(20);
    });

    it("applies scale in layerToDoc", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 0,
        y: 0,
        scaleX: 2,
        scaleY: 2,
        rotation: 0
      };
      const mapper = new CoordinateMapper({ layerTransform: transform });
      const result = mapper.layerToDoc({ x: 10, y: 20 });
      expect(result.x).toBeCloseTo(20);
      expect(result.y).toBeCloseTo(40);
    });

    it("applies 90-degree rotation in docToLayer", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: Math.PI / 2
      };
      const mapper = new CoordinateMapper({ layerTransform: transform });
      const result = mapper.docToLayer({ x: 0, y: 10 });
      expect(result.x).toBeCloseTo(10);
      expect(result.y).toBeCloseTo(0);
    });

    it("round-trips with scale and rotation", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 30,
        y: -15,
        scaleX: 1.5,
        scaleY: 2.0,
        rotation: Math.PI / 6
      };
      const mapper = new CoordinateMapper({
        layerTransform: transform,
        rasterBounds: { x: 5, y: 10 }
      });
      const original = { x: 75, y: 120 };
      const layerPt = mapper.docToLayer(original);
      const roundTrip = mapper.layerToDoc(layerPt);
      expect(roundTrip.x).toBeCloseTo(original.x);
      expect(roundTrip.y).toBeCloseTo(original.y);
    });
  });

  describe("offset property", () => {
    it("returns zero for identity transform without rasterBounds", () => {
      const mapper = new CoordinateMapper({ layerTransform: identity });
      expect(mapper.offset.x).toBe(0);
      expect(mapper.offset.y).toBe(0);
    });

    it("combines layer transform and raster bounds", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
      const mapper = new CoordinateMapper({
        layerTransform: transform,
        rasterBounds: { x: 5, y: 3 }
      });
      expect(mapper.offset.x).toBe(15);
      expect(mapper.offset.y).toBe(23);
    });
  });

  describe("hasOffset property", () => {
    it("returns false for identity with no raster bounds", () => {
      const mapper = new CoordinateMapper({ layerTransform: identity });
      expect(mapper.hasOffset).toBe(false);
    });

    it("returns true when layer has translation", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 1,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
      const mapper = new CoordinateMapper({ layerTransform: transform });
      expect(mapper.hasOffset).toBe(true);
    });

    it("returns true when rasterBounds are non-zero", () => {
      const mapper = new CoordinateMapper({
        layerTransform: identity,
        rasterBounds: { x: 0, y: 1 }
      });
      expect(mapper.hasOffset).toBe(true);
    });
  });

  describe("dirtyToDoc", () => {
    it("offsets dirty rect by translation", () => {
      const transform: AffineTransform = {
        kind: "affine",
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
      const mapper = new CoordinateMapper({ layerTransform: transform });
      const result = mapper.dirtyToDoc({
        minX: 0,
        minY: 0,
        maxX: 50,
        maxY: 30
      });
      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
      expect(result.w).toBe(50);
      expect(result.h).toBe(30);
    });

    it("includes raster bounds in offset", () => {
      const mapper = new CoordinateMapper({
        layerTransform: identity,
        rasterBounds: { x: 5, y: 10 }
      });
      const result = mapper.dirtyToDoc({
        minX: 0,
        minY: 0,
        maxX: 100,
        maxY: 100
      });
      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
      expect(result.w).toBe(100);
      expect(result.h).toBe(100);
    });
  });
});
