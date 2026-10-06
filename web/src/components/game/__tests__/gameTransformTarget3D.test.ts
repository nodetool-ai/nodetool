import { Group, Object3D } from "three";
import { syncGameTransformTarget3D } from "../gameTransformTarget3D";

it("keeps the editor transform target in its scene when a renderer replaces an entity", () => {
  const scene = new Group();
  const parent = new Group();
  parent.position.x = 5;
  const rendered = new Object3D();
  rendered.position.x = 2;
  parent.add(rendered);
  scene.add(parent);
  const target = new Object3D();
  scene.add(target);
  expect(syncGameTransformTarget3D(target, rendered)).toBe(true);
  expect(target.position.x).toBe(7);
  parent.remove(rendered);
  expect(target.parent).toBe(scene);
  const replacement = new Object3D();
  replacement.position.x = 3;
  parent.add(replacement);
  expect(syncGameTransformTarget3D(target, replacement)).toBe(true);
  expect(target.position.x).toBe(8);
});
