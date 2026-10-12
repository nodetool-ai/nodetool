import {
  gameSaveData,
  gameSaveScope,
  gameSaveSlot,
  MAX_GAME_SAVE_LOADS_PER_FRAME,
  MAX_GAME_SAVE_SLOTS,
  MAX_GAME_SAVE_SNAPSHOT_BYTES,
  type GameSaveData,
  type GameSaveLoaded,
  type GameSaveScope
} from "@nodetool-ai/protocol";

import type { GameSaveRequest } from "./script-saves.js";

/** One stored save. `snapshot` is a full session snapshot and only appears on progress saves. */
export interface GameSaveRecord {
  readonly version: 1;
  readonly data: GameSaveData;
  readonly snapshot?: unknown;
}

/**
 * Per-game save storage. Progress and settings saves live in separate scopes, so a slot name can exist in both
 * and removing one never touches the other. Implementations return records as stored. `GamePlayerSaves` validates them.
 */
export interface GameSaveStorage {
  read(scope: GameSaveScope, slot: string): Promise<unknown>;
  write(scope: GameSaveScope, slot: string, record: GameSaveRecord): Promise<void>;
  remove(scope: GameSaveScope, slot: string): Promise<void>;
  slots(scope: GameSaveScope): Promise<readonly string[]>;
}

/** Storage that lives as long as the object. Headless sessions, the CLI and agent playtests use it so runs stay repeatable. */
export function createMemoryGameSaveStorage(): GameSaveStorage & { entries(): Record<GameSaveScope, Record<string, GameSaveRecord>> } {
  const scopes: Record<GameSaveScope, Map<string, string>> = { progress: new Map(), settings: new Map() };
  return {
    read: async (scope, slot) => {
      const stored = scopes[scope].get(slot);
      return stored === undefined ? undefined : JSON.parse(stored) as unknown;
    },
    write: async (scope, slot, record) => { scopes[scope].set(slot, JSON.stringify(record)); },
    remove: async (scope, slot) => { scopes[scope].delete(slot); },
    slots: async (scope) => [...scopes[scope].keys()].sort(),
    entries: () => ({
      progress: Object.fromEntries([...scopes.progress].map(([slot, stored]) => [slot, JSON.parse(stored) as GameSaveRecord])),
      settings: Object.fromEntries([...scopes.settings].map(([slot, stored]) => [slot, JSON.parse(stored) as GameSaveRecord]))
    })
  };
}

const encoder = new TextEncoder();

export interface GamePlayerSavesOptions {
  /** Called when a script-requested save or load fails. The game keeps running. */
  readonly onError?: (error: Error, request: GameSaveRequest) => void;
}

/**
 * The player save API. Hosts call `handle` with a step's save requests after the step and `withLoaded` before the
 * next one. Storage work runs outside the tick, in request order. A finished load waits until the host builds the next
 * input frame, so the loaded data enters the simulation as frame input. Recording that frame is enough to replay it.
 */
export class GamePlayerSaves {
  private queue: Promise<void> = Promise.resolve();
  private ready: GameSaveLoaded[] = [];
  private generation = 0;

  constructor(private readonly storage: GameSaveStorage, private readonly options: GamePlayerSavesOptions = {}) {}

  /** Writes a save. A snapshot is only accepted on a progress save. */
  async save(scope: GameSaveScope, slot: string, data: unknown, snapshot?: unknown): Promise<void> {
    const record = this.record(scope, slot, data, snapshot);
    const existing = await this.storage.slots(scope);
    if (!existing.includes(slot) && existing.length >= MAX_GAME_SAVE_SLOTS) {
      throw new Error(`Game ${scope} saves are limited to ${MAX_GAME_SAVE_SLOTS} slots`);
    }
    await this.storage.write(scope, slot, record);
  }

  /** Reads a save, or null when the slot is empty. Stored data that fails validation is reported as an error. */
  async load(scope: GameSaveScope, slot: string): Promise<GameSaveRecord | null> {
    gameSaveScope.parse(scope);
    gameSaveSlot.parse(slot);
    const stored = await this.storage.read(scope, slot);
    if (stored === undefined || stored === null) { return null; }
    if (typeof stored !== "object" || (stored as { version?: unknown }).version !== 1) {
      throw new Error(`Stored ${scope} save ${slot} has an unsupported format`);
    }
    const data = gameSaveData.safeParse((stored as { data?: unknown }).data);
    if (!data.success) { throw new Error(`Stored ${scope} save ${slot} has invalid data`); }
    const snapshot = (stored as { snapshot?: unknown }).snapshot;
    return scope === "progress" && snapshot !== undefined ? { version: 1, data: data.data, snapshot } : { version: 1, data: data.data };
  }

  async remove(scope: GameSaveScope, slot: string): Promise<void> {
    gameSaveScope.parse(scope);
    gameSaveSlot.parse(slot);
    await this.storage.remove(scope, slot);
  }

  async slots(scope: GameSaveScope): Promise<readonly string[]> {
    gameSaveScope.parse(scope);
    return this.storage.slots(scope);
  }

  /**
   * Queues a step's save and load requests. `snapshot` is called now, before the next step, for saves that store
   * one, so the stored snapshot is the state at the end of the requesting tick.
   */
  handle(requests: readonly GameSaveRequest[] | undefined, snapshot: () => unknown): void {
    if (requests === undefined || requests.length === 0) { return; }
    const generation = this.generation;
    for (const request of requests) {
      const captured = request.kind === "save" && request.snapshot ? snapshot() : undefined;
      this.queue = this.queue.then(async () => {
        if (generation !== this.generation) { return; }
        try {
          if (request.kind === "save") {
            await this.save(request.scope, request.slot, request.data, captured);
            return;
          }
          let data: GameSaveData | null = null;
          try { data = (await this.load(request.scope, request.slot))?.data ?? null; }
          finally {
            // A failed load still answers the script, with null data.
            if (generation === this.generation) { this.ready.push({ scope: request.scope, slot: request.slot, data }); }
          }
        } catch (error) {
          this.options.onError?.(error instanceof Error ? error : new Error(String(error)), request);
        }
      });
    }
  }

  /** Resolves when every queued request has finished. Headless hosts await it between ticks. */
  idle(): Promise<void> {
    return this.queue;
  }

  /**
   * Returns the frame with finished loads attached as `loaded`, at most `MAX_GAME_SAVE_LOADS_PER_FRAME` per frame.
   * A frame without finished loads is returned unchanged, so recorded frames of games without saves keep their shape.
   */
  withLoaded<Frame extends { readonly loaded?: readonly GameSaveLoaded[] }>(frame: Frame): Frame {
    if (this.ready.length === 0) { return frame; }
    const room = MAX_GAME_SAVE_LOADS_PER_FRAME - (frame.loaded?.length ?? 0);
    if (room <= 0) { return frame; }
    const delivered = this.ready.splice(0, room);
    return { ...frame, loaded: [...(frame.loaded ?? []), ...delivered] } as Frame;
  }

  /** Drops queued requests and undelivered loads, for a session reset or a restored snapshot. Writes already started still finish. */
  clear(): void {
    this.generation += 1;
    this.ready = [];
  }

  private record(scope: GameSaveScope, slot: string, data: unknown, snapshot: unknown): GameSaveRecord {
    gameSaveScope.parse(scope);
    gameSaveSlot.parse(slot);
    const parsed = gameSaveData.parse(data);
    if (snapshot === undefined) { return { version: 1, data: parsed }; }
    if (scope === "settings") { throw new Error("Settings saves cannot store a snapshot"); }
    const json = JSON.stringify(snapshot);
    const bytes = encoder.encode(json).byteLength;
    if (bytes > MAX_GAME_SAVE_SNAPSHOT_BYTES) {
      throw new Error(`Save snapshot exceeds ${MAX_GAME_SAVE_SNAPSHOT_BYTES} bytes (${bytes})`);
    }
    return { version: 1, data: parsed, snapshot: JSON.parse(json) as unknown };
  }
}
