import { GameRenderPipeline } from "../renderPipeline.js";

export interface WebGPURenderContext {
  readonly lighting: () => void | Promise<void>;
  readonly sprites: () => void | Promise<void>;
  readonly effects: () => void | Promise<void>;
  readonly hud: () => void | Promise<void>;
}

export class WebGPURenderPipeline extends GameRenderPipeline<WebGPURenderContext> {
  constructor() {
    super();
    this.register({ name: "lighting", order: 0, render: (context) => context.lighting() });
    this.register({ name: "sprites", order: 1, render: (context) => context.sprites() });
    this.register({ name: "effects", order: 2, render: (context) => context.effects() });
    this.register({ name: "hud", order: 3, render: (context) => context.hud() });
  }
}
