import React from "react";
import { render } from "@testing-library/react";
import * as THREE from "three";
import { FollowSelection } from "../ViewportHelpers";

const mockCamera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 1000);
jest.mock("@react-three/fiber", () => ({
  useThree: () => ({ camera: mockCamera }),
  useFrame: jest.fn()
}));
jest.mock("@react-three/drei", () => ({
  Environment: () => null,
  Html: () => null,
  Lightformer: () => null
}));

const makeBox = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

describe("FollowSelection", () => {
  beforeEach(() => {
    mockCamera.position.set(3, 2, 3);
    mockCamera.lookAt(0, 0, 0);
  });

  const setup = (object: THREE.Object3D) => {
    const onLeftView = jest.fn();
    const view = render(<FollowSelection object={object} tick={0} onLeftView={onLeftView} />);
    const edit = (tick: number, target: THREE.Object3D = object) =>
      view.rerender(<FollowSelection object={target} tick={tick} onLeftView={onLeftView} />);
    return { onLeftView, edit };
  };

  it("follows an edit that moves the selection out of view", () => {
    const box = makeBox();
    const { onLeftView, edit } = setup(box);

    box.position.y = 8;
    edit(1);

    expect(onLeftView).toHaveBeenCalledWith(box.uuid);
  });

  it("leaves the camera alone while the edited selection stays in view", () => {
    const box = makeBox();
    const { onLeftView, edit } = setup(box);

    box.position.x = 0.5;
    edit(1);

    expect(onLeftView).not.toHaveBeenCalled();
  });

  it("does not move the camera for a new selection or an edit that left the bounds unchanged", () => {
    const box = makeBox();
    const far = makeBox();
    far.position.y = 8;
    const { onLeftView, edit } = setup(box);

    edit(1, far);
    edit(2, far);

    expect(onLeftView).not.toHaveBeenCalled();
  });
});
