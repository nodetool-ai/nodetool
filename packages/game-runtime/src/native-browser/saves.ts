import { MAX_GAME_SAVE_LOADS_PER_FRAME, MAX_GAME_SAVE_SLOTS, gameSaveSlot, gameSaveScope } from "@nodetool-ai/protocol";
import { nativeJsonSaveRecord, nativeSaveRequest, type NativeJsonSaveRecord, type NativeJsonSaveStorage,
  type NativeSaveCompletion, type NativeSaveRequest, type NativeSaveScope } from "@nodetool-ai/protocol/native-game";

export function createNativeMemorySaveStorage(): NativeJsonSaveStorage {
  const scopes = { progress: new Map<string, NativeJsonSaveRecord>(), settings: new Map<string, NativeJsonSaveRecord>() };
  return {
    persistence: "memory",
    async read(scope, slot) { return structuredClone(scopes[gameSaveScope.parse(scope)].get(gameSaveSlot.parse(slot)) ?? null); },
    async write(scope, slot, record) {
      const entries = scopes[gameSaveScope.parse(scope)]; gameSaveSlot.parse(slot);
      const parsed = nativeJsonSaveRecord.parse(record);
      if (!entries.has(slot) && entries.size >= MAX_GAME_SAVE_SLOTS) { throw new Error("Native save slot limit reached"); }
      entries.set(slot, structuredClone(parsed));
    }
  };
}

export interface NativeJsonSaveHostOptions {
  readonly replay?: boolean;
  readonly onDiagnostic?: (message: string) => void;
}
/** Serial external IO begins only after a committed frame. Loaded values are recorded on a later tick. */
export class NativeJsonSaveHost {
  private generation = 0;
  private lastTick = -1;
  private lastSequence = -1;
  private epoch = 0;
  private pending = 0;
  private chain = Promise.resolve();
  private readonly completed: NativeSaveCompletion[] = [];
  constructor(private readonly storage: NativeJsonSaveStorage, private readonly options: NativeJsonSaveHostOptions = {}) {}

  reset(generation: number): void {
    if (!Number.isSafeInteger(generation) || generation < 1) { throw new Error("Invalid native save generation"); }
    this.epoch += 1; this.generation = generation; this.lastTick = -1; this.lastSequence = -1; this.completed.length = 0;
  }

  consume(requests: readonly NativeSaveRequest[], generation: number): void {
    if (!this.generation) { this.reset(generation); }
    if (generation !== this.generation) { throw new Error("Stale native save generation"); }
    if (this.options.replay) { return; }
    const parsed = requests.map((request) => nativeSaveRequest.parse(request));
    if (parsed.length > 4) { throw new Error("Native save requests exceed per-tick limit"); }
    const fresh: NativeSaveRequest[] = [];
    let tick = this.lastTick, sequence = this.lastSequence;
    for (const request of parsed) {
      if (request.generation !== generation) { throw new Error("Native save request generation mismatch"); }
      if (request.tick < tick || (request.tick === tick && request.sequence <= sequence)) { continue; }
      if (request.tick === tick && request.sequence !== sequence + 1) { throw new Error("Native save request sequence gap"); }
      if (request.tick !== tick && request.sequence !== 0) { throw new Error("Native save batch must start at sequence zero"); }
      tick = request.tick; sequence = request.sequence; fresh.push(request);
    }
    // Completed loads also reserve capacity, so an undrained consumer cannot grow memory without bound.
    if (this.pending + this.completed.length + fresh.length > 8) { throw new Error("Native save queue is full"); }
    this.lastTick = tick; this.lastSequence = sequence;
    const epoch = this.epoch;
    for (const request of fresh) {
      this.pending += 1;
      this.chain = this.chain.then(async () => {
        if (epoch !== this.epoch) { return; }
        let data: NativeJsonSaveRecord["data"] | null = null;
        let diagnostic: string | undefined;
        try {
          if (request.kind === "save") { await this.storage.write(request.scope, request.slot, nativeJsonSaveRecord.parse({ formatVersion: 1, data: request.data })); }
          else {
            const record = await this.storage.read(request.scope, request.slot);
            if (record === null) { throw new Error(`Native JSON save slot is empty: ${request.scope}/${request.slot}`); }
            data = nativeJsonSaveRecord.parse(record).data;
          }
        } catch (error) {
          diagnostic = (error instanceof Error ? error.message : String(error)).slice(0, 4096);
          try { this.options.onDiagnostic?.(diagnostic); } catch { /* A diagnostic sink cannot poison ordered storage delivery. */ }
        }
        if (request.kind === "load" && epoch === this.epoch) {
          const completion: NativeSaveCompletion = { generation, tick: request.tick, sequence: request.sequence, scope: request.scope, slot: request.slot, data };
          if (diagnostic) { completion.diagnostic = diagnostic; }
          this.completed.push(completion);
        }
      }).finally(() => { this.pending -= 1; });
    }
  }

  takeLoaded(generation: number): readonly { readonly scope: NativeSaveScope; readonly slot: string; readonly data: NativeJsonSaveRecord["data"] | null }[] {
    if (generation !== this.generation || this.options.replay) { return []; }
    return this.completed.splice(0, MAX_GAME_SAVE_LOADS_PER_FRAME).map(({ scope, slot, data }) => ({ scope, slot, data }));
  }
  async drain(): Promise<void> { await this.chain; }
}

export interface NativeIndexedDbSaveOptions { readonly gameId: string; readonly engineContract: string; readonly indexedDB?: IDBFactory; readonly databaseName?: string }
export async function createNativeIndexedDbSaveStorage(options: NativeIndexedDbSaveOptions): Promise<NativeJsonSaveStorage & { close(): void }> {
  if (!options.gameId || !options.engineContract) { throw new Error("Native save namespace requires the full game ID and engine contract"); }
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) { throw new Error("IndexedDB is unavailable"); }
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(options.databaseName ?? "nodetool-native-json-saves", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("saves"); };
    request.onerror = () => reject(request.error ?? new Error("Native save database denied"));
    request.onblocked = () => reject(new Error("Native save database upgrade blocked"));
    request.onsuccess = () => resolve(request.result);
  });
  const prefix = (scope: NativeSaveScope): string => JSON.stringify([options.gameId, options.engineContract, gameSaveScope.parse(scope)]) + ":";
  const key = (scope: NativeSaveScope, slot: string): string => prefix(scope) + gameSaveSlot.parse(slot);
  return {
    persistence: "durable", close: () => database.close(),
    async read(scope, slot) {
      return new Promise<NativeJsonSaveRecord | null>((resolve, reject) => {
        const transaction = database.transaction("saves", "readonly");
        const request = transaction.objectStore("saves").get(key(scope, slot));
        let result: NativeJsonSaveRecord | null = null;
        request.onsuccess = () => {
          try { result = request.result === undefined ? null : nativeJsonSaveRecord.parse(request.result); }
          catch (error) { reject(error); }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("Native save read failed"));
      });
    },
    async write(scope, slot, record) {
      const parsed = nativeJsonSaveRecord.parse(record), saveKey = key(scope, slot), scopePrefix = prefix(scope);
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("saves", "readwrite"), store = transaction.objectStore("saves");
        let failure: Error | undefined;
        // The read and write share one readwrite transaction, making the scope slot limit atomic.
        const request = store.getAllKeys(IDBKeyRange.bound(scopePrefix, scopePrefix + "\uffff"), MAX_GAME_SAVE_SLOTS + 1);
        request.onsuccess = () => {
          if (!request.result.includes(saveKey) && request.result.length >= MAX_GAME_SAVE_SLOTS) {
            failure = new Error("Native save slot limit reached"); transaction.abort(); return;
          }
          store.put(parsed, saveKey);
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error ?? new Error("Native save write failed"));
      });
    }
  };
}
