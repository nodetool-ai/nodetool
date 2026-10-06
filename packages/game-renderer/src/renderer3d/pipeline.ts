import * as THREE from "three";
import { GameRenderPipeline } from "../renderPipeline.js";

export interface RenderContext3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly hudScene: THREE.Scene;
  readonly hudCamera: THREE.Camera;
}

export class RenderPipeline3D extends GameRenderPipeline<RenderContext3D> {
  constructor() {
    super();
    this.register({ name: "scene", order: 0, render: ({ renderer, scene, camera }) => {
      renderer.clear();
      renderer.render(scene, camera);
    } });
    this.register({ name: "overlay", order: 1, render: ({ renderer }) => renderer.clearDepth() });
    this.register({ name: "hud", order: 2, render: ({ renderer, hudScene, hudCamera }) => renderer.render(hudScene, hudCamera) });
  }
}
