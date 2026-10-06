export interface GameRenderPass<Context> {
  readonly name: string;
  readonly order: number;
  readonly render: (context: Context) => void | Promise<void>;
}

/** Runs named presentation passes in registration order within each numeric order. */
export class GameRenderPipeline<Context> {
  private readonly passes: GameRenderPass<Context>[] = [];

  register(pass: GameRenderPass<Context>): void {
    if (this.passes.some((entry) => entry.name === pass.name)) {
      throw new Error(`Render pass ${pass.name} is already registered`);
    }
    this.passes.push(pass);
    this.passes.sort((first, second) => first.order - second.order);
  }

  async render(context: Context): Promise<void> {
    for (const pass of this.passes) { await pass.render(context); }
  }
}
