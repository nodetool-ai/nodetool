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

/**
 * Storage operations that may wait in one `GamePlayerSaves` queue, counting the one running. A script can request 4
 * saves or loads per tick at 60 ticks per second, so a slow store fills the queue in a few ticks. Further operations
 * are rejected instead of piling up behind it.
 */
export const MAX_GAME_SAVE_QUEUE = 8;

export interface GamePlayerSavesOptions {
  /** Called when a script-requested save or load fails. The game keeps running. */
  readonly onError?: (error: Error, request: GameSaveRequest) => void;
  /**
   * When false, script saves store their data without the requested snapshot, and the snapshot is never taken. Hosts
   * that never read snapshots back use it to keep large snapshots out of small storage. Defaults to true.
   */
  readonly storeSnapshots?: boolean;
}

/**
 * The player save API. Hosts call `handle` with a step's save requests after the step and `withLoaded` before the
 * next one. Every storage operation, from scripts or from the host, runs outside the tick through one bounded queue in
 * request order. A finished load waits until the host builds the next input frame, so the loaded data enters the
 * simulation as frame input. Recording that frame is enough to replay it.
 */
export class GamePlayerSaves {
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private snapshotPending = false;
  private ready: GameSaveLoaded[] = [];
  private generation = 0;

  constructor(private readonly storage: GameSaveStorage, private readonly options: GamePlayerSavesOptions = {}) {}

  /**
   * Writes a save. A snapshot is only accepted on a progress save, and only one snapshot save may be pending at a
   * time. Pass the snapshot as a function to skip taking it when the save is rejected.
   */
  save(scope: GameSaveScope, slot: string, data: unknown, snapshot?: unknown): Promise<void> {
    return this.queueSave(scope, slot, data, snapshot === undefined ? undefined : () => snapshot, () => true);
  }

  /** Reads a save, or null when the slot is empty. Stored data that fails validation is reported as an error. */
  load(scope: GameSaveScope, slot: string): Promise<GameSaveRecord | null> {
    return this.enqueue(() => this.read(scope, slot));
  }

  remove(scope: GameSaveScope, slot: string): Promise<void> {
    return this.enqueue(async () => {
      gameSaveScope.parse(scope);
      gameSaveSlot.parse(slot);
      await this.storage.remove(scope, slot);
    });
  }

  slots(scope: GameSaveScope): Promise<readonly string[]> {
    return this.enqueue(async () => {
      gameSaveScope.parse(scope);
      return this.storage.slots(scope);
    });
  }

  /**
   * Queues a step's save and load requests. `snapshot` is called now, before the next step, for saves that store
   * one, so the stored snapshot is the state at the end of the requesting tick. A request the queue rejects is
   * reported through `onError`, and a rejected load still answers the script with null data.
   */
  handle(requests: readonly GameSaveRequest[] | undefined, snapshot: () => unknown): void {
    if (requests === undefined || requests.length === 0) { return; }
    const generation = this.generation;
    const current = (): boolean => generation === this.generation;
    const report = (request: GameSaveRequest) => (error: unknown): void => {
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)), request);
    };
    for (const request of requests) {
      if (request.kind === "save") {
        const stored = request.snapshot && this.options.storeSnapshots !== false ? snapshot : undefined;
        this.queueSave(request.scope, request.slot, request.data, stored, current)
          .catch(report(request));
        continue;
      }
      // A failed or rejected load still answers the script, with null data.
      const answer = (data: GameSaveData | null): void => {
        if (current()) { this.ready.push({ scope: request.scope, slot: request.slot, data }); }
      };
      this.enqueue(async () => {
        if (!current()) { return; }
        let data: GameSaveData | null = null;
        try { data = (await this.read(request.scope, request.slot))?.data ?? null; } catch (error) { report(request)(error); }
        answer(data);
      }).catch((error: unknown) => { report(request)(error); answer(null); });
    }
  }

  /** Resolves when every queued operation has finished. Headless hosts await it between ticks. */
  idle(): Promise<void> {
    return this.queue;
  }

  /**
   * Returns the frame with finished loads attached as `loaded`, at most `MAX_GAME_SAVE_LOADS_PER_FRAME` per frame.
   * A frame without finished loads is returned unchanged, so recorded frames of games without saves keep their shape.
   * A frame that already carries `loaded`, such as a recorded frame being replayed, is returned unchanged and
   * receives no pending loads.
   */
  withLoaded<Frame extends { readonly loaded?: readonly GameSaveLoaded[] }>(frame: Frame): Frame {
    if (this.ready.length === 0 || frame.loaded !== undefined) { return frame; }
    const delivered = this.ready.splice(0, MAX_GAME_SAVE_LOADS_PER_FRAME);
    return { ...frame, loaded: delivered } as Frame;
  }

  /** Drops queued requests and undelivered loads, for a session reset or a restored snapshot. Writes already started still finish. */
  clear(): void {
    this.generation += 1;
    this.ready = [];
  }

  /** Runs `work` after every earlier operation, or rejects at once when `MAX_GAME_SAVE_QUEUE` operations are pending. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (this.pending >= MAX_GAME_SAVE_QUEUE) {
      return Promise.reject(new Error(`Game save queue is full (${MAX_GAME_SAVE_QUEUE} pending)`));
    }
    this.pending += 1;
    const result = this.queue.then(work).finally(() => { this.pending -= 1; });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /**
   * Validates and queues a save. The queue and snapshot checks run before `snapshot` is called, so a rejected save
   * costs no snapshot. The slot limit is checked inside the queued operation, so concurrent saves cannot exceed it.
   */
  private queueSave(
    scope: GameSaveScope,
    slot: string,
    data: unknown,
    snapshot: (() => unknown) | undefined,
    current: () => boolean
  ): Promise<void> {
    try {
      gameSaveScope.parse(scope);
      gameSaveSlot.parse(slot);
      if (this.pending >= MAX_GAME_SAVE_QUEUE) { throw new Error(`Game save queue is full (${MAX_GAME_SAVE_QUEUE} pending)`); }
      if (snapshot !== undefined && scope === "settings") { throw new Error("Settings saves cannot store a snapshot"); }
      if (snapshot !== undefined && this.snapshotPending) { throw new Error("A snapshot save is already pending"); }
      const record = this.record(slot, data, snapshot?.());
      if (record.snapshot !== undefined) { this.snapshotPending = true; }
      return this.enqueue(async () => {
        try {
          if (!current()) { return; }
          const existing = await this.storage.slots(scope);
          if (!existing.includes(slot) && existing.length >= MAX_GAME_SAVE_SLOTS) {
            throw new Error(`Game ${scope} saves are limited to ${MAX_GAME_SAVE_SLOTS} slots`);
          }
          await this.storage.write(scope, slot, record);
        } finally {
          if (record.snapshot !== undefined) { this.snapshotPending = false; }
        }
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private async read(scope: GameSaveScope, slot: string): Promise<GameSaveRecord | null> {
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

  /** Serializes the snapshot once. UTF-8 needs between 1 and 3 bytes per UTF-16 code unit, so most sizes are decided without encoding. */
  private record(slot: string, data: unknown, snapshot: unknown): GameSaveRecord {
    const parsed = gameSaveData.parse(data);
    if (snapshot === undefined) { return { version: 1, data: parsed }; }
    const json = JSON.stringify(snapshot);
    if (json === undefined) { throw new Error(`Save ${slot} snapshot is not JSON`); }
    const bytes = json.length * 3 <= MAX_GAME_SAVE_SNAPSHOT_BYTES ? json.length
      : json.length > MAX_GAME_SAVE_SNAPSHOT_BYTES ? json.length : encoder.encode(json).byteLength;
    if (bytes > MAX_GAME_SAVE_SNAPSHOT_BYTES) {
      throw new Error(`Save snapshot exceeds ${MAX_GAME_SAVE_SNAPSHOT_BYTES} bytes (at least ${bytes})`);
    }
    return { version: 1, data: parsed, snapshot: JSON.parse(json) as unknown };
  }
}
