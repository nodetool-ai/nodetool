import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = fs.readFileSync(new URL("./EffectMaskEdits.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "");
const edits = vm.createContext({});
vm.runInContext(source + "\nglobalThis.api = {maskable, add, remove, patch, translate, moveVertex, insertVertex, removeVertex, toggleSmooth, contains, appendVertex, nearestSegment, ellipseVertices};", edits);
const api = edits.api;
const plain = value => JSON.parse(JSON.stringify(value));

test("grade effects are maskable and others are not", () => {
  for (const type of ["color", "exposure", "liftGammaGain", "curves", "hueSatCurves", "secondaryColor", "vignette", "sharpen", "blur"]) assert.ok(api.maskable(type), type);
  assert.equal(api.maskable("pixelate"), false);
});

test("the ellipse matches the TypeScript construction", () => {
  const v = plain(api.ellipseVertices(0.5, 0.5, 0.25, 0.25));
  assert.equal(v.length, 4);
  assert.deepEqual(v[0], { x: 0.5, y: 0.25, inX: -0.25 * 0.5522847498307936, inY: 0, outX: 0.25 * 0.5522847498307936, outY: 0 });
});

test("edits return new arrays and keep other masks", () => {
  let masks = api.add([], "polygon", "a");
  masks = api.add(masks, "ellipse", "b");
  assert.equal(masks[1].name, "Mask (2)");
  const moved = api.translate(masks, "a", 0.1, 0);
  assert.equal(moved[0].vertices[0].x, 0.4);
  assert.equal(masks[0].vertices[0].x, 0.3);
  assert.equal(moved[1], masks[1]);
  assert.equal(api.patch(masks, "a", { feather: undefined })[0].feather, undefined);
  assert.equal(api.remove(masks, "a").length, 1);
});

test("vertex edits keep at least three vertices and turn an ellipse into a path", () => {
  let masks = api.add([], "ellipse", "e");
  masks = api.insertVertex(masks, "e", 0, 0.6, 0.3);
  assert.equal(masks[0].vertices.length, 5);
  assert.equal(masks[0].shape, "bezier");
  let poly = api.add([], "polygon", "p");
  poly = api.removeVertex(poly, "p", 0);
  assert.equal(poly[0].vertices.length, 3);
  assert.equal(api.removeVertex(poly, "p", 0)[0].vertices.length, 3);
});

test("a smooth tangent drag keeps the opposite tangent collinear unless broken", () => {
  const masks = api.add([], "ellipse", "e");
  const smooth = api.moveVertex(masks, "e", [0], 0, 0.1, "out", false)[0].vertices[0];
  assert.ok(Math.abs(smooth.inX / smooth.outX - smooth.inY / smooth.outY) < 1e-9);
  const broken = api.moveVertex(masks, "e", [0], 0, 0.1, "out", true)[0].vertices[0];
  assert.equal(broken.inY, 0);
  const point = api.moveVertex(masks, "e", [0, 2], 0.1, 0, "point")[0].vertices;
  assert.equal(point[0].x, 0.6);
  assert.equal(point[1].x, 0.75);
});

test("contains, nearestSegment and the pen", () => {
  const masks = api.add([], "polygon", "p");
  assert.ok(api.contains(masks[0], 0.5, 0.5));
  assert.equal(api.contains(masks[0], 0.1, 0.1), false);
  assert.equal(api.nearestSegment(masks[0], 0.5, 0.31).after, 0);
  const smooth = api.toggleSmooth(masks, "p", 0)[0];
  assert.ok(smooth.vertices[0].outX);
  assert.equal(api.toggleSmooth([smooth], "p", 0)[0].vertices[0].outX, undefined);
  const pen = api.appendVertex(api.add([], "bezier", "q", [{ x: 0.1, y: 0.1 }]), "q", 0.2, 0.2);
  assert.equal(pen[0].vertices.length, 2);
});
