import { createLogger } from "@nodetool-ai/config";
import {
  loadWhisperNode,
  type LibVariant,
  type WhisperContext
} from "./binding.js";

const log = createLogger("whisper-cpp.context-cache");
interface Entry {
  context: Promise<WhisperContext>;
  tail: Promise<void>;
  pending: number;
  lastUsed: number;
}
export class ContextCache {
  private readonly entries = new Map<string, Entry>();
  private admission: Promise<void> = Promise.resolve();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly maxModels = 2,
    private readonly idleMs = 10 * 60 * 1000
  ) {
    const sweep = async (): Promise<void> => {
      try {
        await this.evictIdle();
      } catch (error) {
        log.warn("Context eviction failed: %s", String(error));
      }
    };
    this.timer = setInterval(
      () => {
        void sweep();
      },
      Math.min(idleMs, 60000)
    );
    this.timer.unref();
  }
  private async release(key: string, entry: Entry): Promise<void> {
    this.entries.delete(key);
    await (await entry.context).release();
  }
  private async evictIdle(): Promise<void> {
    const eviction = this.admission.then(async () => {
      for (const [key, entry] of this.entries) {
        if (entry.pending === 0 && Date.now() - entry.lastUsed >= this.idleMs) {
          await this.release(key, entry);
        }
      }
    });
    this.admission = eviction.catch(() => {});
    await eviction;
  }
  async withContext<T>(
    modelPath: string,
    variant: LibVariant,
    useGpu: boolean,
    run: (context: WhisperContext) => Promise<T>
  ): Promise<T> {
    const key = JSON.stringify([modelPath, variant, useGpu]);
    const admitted = this.admission.then(async () => {
      let entry = this.entries.get(key);
      if (!entry) {
        while (this.entries.size >= this.maxModels) {
          // Evict the least recently used idle context. A busy context's
          // lastUsed is from before its job started, so it would otherwise
          // look oldest and make this admission wait for its whole job.
          const oldest = [...this.entries].sort(
            (a, b) =>
              Number(a[1].pending > 0) - Number(b[1].pending > 0) ||
              a[1].lastUsed - b[1].lastUsed
          )[0];
          if (!oldest) {
            break;
          }
          await oldest[1].tail;
          if (this.entries.get(oldest[0]) === oldest[1]) {
            await this.release(oldest[0], oldest[1]);
          }
        }
        const context = loadWhisperNode().then((binding) =>
          binding.initWhisper({ filePath: modelPath, useGpu }, variant)
        );
        entry = {
          context,
          tail: Promise.resolve(),
          pending: 0,
          lastUsed: Date.now()
        };
        this.entries.set(key, entry);
      }
      const current = entry;
      current.pending++;
      const result = current.tail.then(async () => {
        try {
          return await run(await current.context);
        } finally {
          current.pending--;
          current.lastUsed = Date.now();
          try {
            await current.context;
          } catch {
            if (this.entries.get(key) === current) {
              this.entries.delete(key);
            }
          }
        }
      });
      current.tail = result.then(
        () => {},
        () => {}
      );
      return { result };
    });
    this.admission = admitted.then(
      () => {},
      () => {}
    );
    return (await admitted).result;
  }
  async dispose(): Promise<void> {
    clearInterval(this.timer);
    for (const [key, entry] of this.entries) {
      await entry.tail;
      await this.release(key, entry);
    }
  }
}
export const contextCache = new ContextCache();
