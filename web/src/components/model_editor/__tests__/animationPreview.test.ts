import * as THREE from "three";

import { createAnimationPreview } from "../animationPreview";

const setup = () => {
  const root = new THREE.Group();
  const box = new THREE.Object3D();
  box.name = "Box";
  box.position.set(1, 0, 0);
  root.add(box);
  const slide = new THREE.AnimationClip("Slide", 2, [
    new THREE.VectorKeyframeTrack(`${box.uuid}.position`, [0, 2], [0, 0, 0, 10, 0, 0])
  ]);
  const lift = new THREE.AnimationClip("Lift", 1, [
    new THREE.VectorKeyframeTrack(`${box.uuid}.position`, [0, 1], [0, 0, 0, 0, 5, 0])
  ]);
  return { root, box, preview: createAnimationPreview(root, [slide, lift]) };
};

describe("createAnimationPreview", () => {
  it("poses the scene at a time and restores the rest pose on stop", () => {
    const { box, preview } = setup();
    expect(preview.isActive()).toBe(false);

    preview.select(0);
    preview.setTime(1);
    expect(box.position.x).toBeCloseTo(5);
    expect(preview.isActive()).toBe(true);

    preview.stop();
    expect(box.position.toArray()).toEqual([1, 0, 0]);
    expect(preview.isActive()).toBe(false);
  });

  it("loops when advancing past the end", () => {
    const { preview } = setup();
    preview.select(0);
    preview.advance(1.5);
    expect(preview.advance(1)).toBeCloseTo(0.5);
    expect(preview.duration()).toBe(2);
  });

  it("switches clips without losing the first rest pose", () => {
    const { box, preview } = setup();
    preview.select(0);
    preview.setTime(2 - 1e-6);
    preview.select(1);
    preview.setTime(0.5);
    expect(box.position.x).toBeCloseTo(0);
    expect(box.position.y).toBeCloseTo(2.5);

    preview.stop();
    expect(box.position.toArray()).toEqual([1, 0, 0]);
  });
});
