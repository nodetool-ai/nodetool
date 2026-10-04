import type { StoredRunTraceUpdate } from "@nodetool-ai/protocol";

export type LiveRunTraceUpdate = StoredRunTraceUpdate & { resnapshot_required?: true };

const MAX_BUFFERED_SPANS = 128;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

/** One transport write at a time, with a bounded cache of each span's latest record. */
export class RunTraceLiveDelivery {
  private readonly queued = new Map<string, { update: StoredRunTraceUpdate; bytes: number }>();
  private queuedBytes = 0;
  private sending = false;
  private closed = false;
  private resnapshotRequired = false;

  constructor(
    private readonly send: (update: LiveRunTraceUpdate) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly limits = { spans: MAX_BUFFERED_SPANS, bytes: MAX_BUFFERED_BYTES }
  ) {}

  get bufferedSpanCount(): number { return this.queued.size; }
  get bufferedBytes(): number { return this.queuedBytes; }

  enqueue(update: StoredRunTraceUpdate): void {
    if (this.closed) { return; }
    const key = `${update.run_id}:${update.record.span_id}`;
    const previous = this.queued.get(key);
    if (previous) {
      this.queued.delete(key);
      this.queuedBytes -= previous.bytes;
      this.resnapshotRequired = true;
    }
    const bytes = Buffer.byteLength(JSON.stringify(update));
    if (bytes > this.limits.bytes) {
      this.resnapshotRequired = true;
      return;
    }
    this.queued.set(key, { update, bytes });
    this.queuedBytes += bytes;
    while (this.queued.size > this.limits.spans || this.queuedBytes > this.limits.bytes) {
      const oldestKey = this.queued.keys().next().value;
      if (oldestKey === undefined) { break; }
      const oldest = this.queued.get(oldestKey);
      this.queued.delete(oldestKey);
      this.queuedBytes -= oldest?.bytes ?? 0;
      this.resnapshotRequired = true;
    }
    if (!this.sending) { void this.flush(); }
  }

  close(): void {
    this.closed = true;
    this.queued.clear();
    this.queuedBytes = 0;
  }

  private async flush(): Promise<void> {
    this.sending = true;
    try {
      while (!this.closed && this.queued.size > 0) {
        const key = this.queued.keys().next().value;
        if (key === undefined) { break; }
        const next = this.queued.get(key);
        if (!next) { break; }
        this.queued.delete(key);
        this.queuedBytes -= next.bytes;
        const resnapshot = this.resnapshotRequired;
        this.resnapshotRequired = false;
        try {
          const update: LiveRunTraceUpdate = { ...next.update };
          if (resnapshot) { update.resnapshot_required = true; }
          await this.send(update);
        } catch (error) {
          this.resnapshotRequired = true;
          this.onError(error);
        }
      }
    } finally {
      this.sending = false;
    }
  }
}
