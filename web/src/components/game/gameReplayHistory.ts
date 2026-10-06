export const GAME_REPLAY_HISTORY_LIMIT = 3600;
const CHECKPOINT_INTERVAL = 600;

/** Bounds replay inputs and retains a snapshot before the oldest recorded tick. */
export class GameReplayHistory<Input, Snapshot> {
  private readonly entries: Array<{ input: Input; checkpoint?: Snapshot } | undefined> = [];
  private start = 0;
  private count = 0;
  private checkpoint: Snapshot | undefined;

  clear(snapshot?: Snapshot): void {
    this.entries.length = 0;
    this.start = 0;
    this.count = 0;
    this.checkpoint = snapshot;
  }

  needsCheckpoint(): boolean {
    return this.count % CHECKPOINT_INTERVAL === 0;
  }

  record(input: Input, snapshot: () => Snapshot): void {
    if (this.count === GAME_REPLAY_HISTORY_LIMIT) {
      let removed = 1;
      while (removed < this.count && !this.entries[(this.start + removed) % GAME_REPLAY_HISTORY_LIMIT]?.checkpoint) { removed++; }
      const next = (this.start + removed) % GAME_REPLAY_HISTORY_LIMIT;
      this.checkpoint = this.entries[next]?.checkpoint;
      for (let index = 0; index < removed; index++) { this.entries[(this.start + index) % GAME_REPLAY_HISTORY_LIMIT] = undefined; }
      this.start = next;
      this.count -= removed;
    }
    const nextCheckpoint = this.count % CHECKPOINT_INTERVAL === 0 ? snapshot() : undefined;
    if (this.count === 0 && this.checkpoint === undefined) { this.checkpoint = nextCheckpoint; }
    this.entries[(this.start + this.count) % GAME_REPLAY_HISTORY_LIMIT] = {
      input: structuredClone(input),
      checkpoint: nextCheckpoint
    };
    this.count++;
  }

  replay(): { snapshot: Snapshot | undefined; inputs: Input[] } {
    return { snapshot: this.checkpoint, inputs: Array.from({ length: this.count }, (_, index) => {
      const entry = this.entries[(this.start + index) % GAME_REPLAY_HISTORY_LIMIT];
      if (!entry) { throw new Error("Replay input history is incomplete"); }
      return entry.input;
    }) };
  }
}
