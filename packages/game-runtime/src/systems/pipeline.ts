import type { GameStepTimings, GameSystemTiming } from "@nodetool-ai/protocol";

/** Systems mutate the session-owned simulation state through their tick context. */
export interface GameSystem<Document, Scene, Context, Snapshot = null> {
  readonly name: string;
  init(document: Document, scene: Scene): void;
  step(context: Context): void;
  snapshot(): Snapshot;
  restore(snapshot: Snapshot): void;
}

/** Ordered simulation stages. Untimed steps never read a clock or allocate timing records. */
export class GameSystemPipeline<Document, Scene, Context, Snapshot = null> {
  constructor(
    readonly systems: readonly GameSystem<Document, Scene, Context, Snapshot>[]
  ) {
    const names = new Set<string>();
    for (const system of systems) {
      if (names.has(system.name)) {
        throw new Error(`Duplicate game system ${system.name}`);
      }
      names.add(system.name);
    }
  }
  init(document: Document, scene: Scene): void {
    for (const system of this.systems) {
      system.init(document, scene);
    }
  }
  snapshot(): Readonly<Record<string, Snapshot>> {
    return Object.fromEntries(
      this.systems.map((system) => [system.name, system.snapshot()])
    );
  }
  restore(saved: Readonly<Record<string, Snapshot>>): void {
    // Later stages own the entity set on which earlier spatial adapters depend.
    for (const system of [...this.systems].reverse()) {
      const state = saved[system.name];
      if (state === undefined) {
        throw new Error(`Missing snapshot for game system ${system.name}`);
      }
      system.restore(state);
    }
  }
  step(context: Context): void {
    for (const system of this.systems) {
      system.step(context);
    }
  }
  stepTimed(
    context: Context,
    clock: () => number = () => performance.now()
  ): GameStepTimings {
    const systems: GameSystemTiming[] = [];
    const started = clock();
    for (const system of this.systems) {
      const before = clock();
      system.step(context);
      systems.push({ system: system.name, durationMs: clock() - before });
    }
    return { systems, totalMs: clock() - started };
  }
}

/** Stateless stage adapter. Persistent state remains in the existing session snapshot. */
export function gameSystem<Document, Scene, Context>(
  name: string,
  step: (context: Context) => void
): GameSystem<Document, Scene, Context> {
  return {
    name,
    init(): void {},
    step,
    snapshot: () => null,
    restore(saved): void {
      if (saved !== null) {
        throw new Error(`Stateless game system ${name} cannot restore state`);
      }
    }
  };
}

export function statefulGameSystem<Document, Scene, Context, Snapshot>(
  name: string,
  step: (context: Context) => void,
  snapshot: () => Snapshot,
  restore: (saved: Snapshot) => void
): GameSystem<Document, Scene, Context, Snapshot> {
  return { name, init(): void {}, step, snapshot, restore };
}
