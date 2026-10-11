import * as THREE from "three";
import { GameRenderPipeline } from "../renderPipeline.js";
import type { GamePostProcessor3D } from "./passes/post-processing.js";

export interface RenderContext3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly hudScene: THREE.Scene;
  readonly hudCamera: THREE.Camera;
  readonly postProcessor: GamePostProcessor3D;
}

export class RenderPipeline3D extends GameRenderPipeline<RenderContext3D> {
  constructor() {
    super();
    this.register({ name: "scene", order: 0, render: ({ scene, camera, postProcessor }) => postProcessor.render(scene, camera) });
    this.register({ name: "overlay", order: 1, render: ({ renderer }) => renderer.clearDepth() });
    this.register({ name: "hud", order: 2, render: ({ renderer, hudScene, hudCamera }) => renderer.render(hudScene, hudCamera) });
  }
}
