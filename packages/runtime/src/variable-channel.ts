/**
 * VariableChannel — a typed async broadcast channel backing Set/Get Variable.
 *
 * A Set Variable node `send`s values onto a named channel; readers consume
 * them without an explicit graph edge:
 *   - `first()` resolves with the first value sent (cached), so a Prompt can
 *     wait for a variable to exist before rendering. Resolves `undefined` if
 *     the channel closes without ever receiving a value.
 *   - `stream()` is a replaying async iterator: every subscriber sees the full
 *     value history then live values until the channel closes, so a Get
 *     Variable's streaming output is independent of scheduling order.
 *
 * The channel is generic in its value type so callers stay type-safe; the
 * node-graph layer derives the concrete type from whatever feeds Set Variable.
 *
 * Lifecycle: the workflow runner closes a channel once its last Set Variable
 * writer finishes, which unblocks waiting readers (with the buffered values,
 * or `undefined`/end-of-stream when nothing was sent).
 */
export class VariableChannel<T = unknown> {
  private readonly _buffer: T[] = [];
  private _closed = false;
  private _hasValue = false;
  /** Resolvers waiting on {@link first}. */
  private _firstWaiters: Array<(value: T | undefined) => void> = [];
  /** Resolvers waiting for the next {@link stream} tick (new value or close). */
  private _streamWaiters: Array<() => void> = [];

  /** Whether the channel has been closed (no further values will arrive). */
  get closed(): boolean {
    return this._closed;
  }

  /** Whether at least one value has been sent. */
  get hasValue(): boolean {
    return this._hasValue;
  }

  /** Append a value and wake any waiting readers. No-op once closed. */
  send(value: T): void {
    if (this._closed) {
      return;
    }
    this._buffer.push(value);
    const firstArrival = !this._hasValue;
    this._hasValue = true;

    if (firstArrival) {
      const waiters = this._firstWaiters;
      this._firstWaiters = [];
      for (const resolve of waiters) {
        resolve(value);
      }
    }
    this._wakeStreams();
  }

  /** Mark the channel closed and release every waiting reader. Idempotent. */
  close(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    if (!this._hasValue) {
      const waiters = this._firstWaiters;
      this._firstWaiters = [];
      for (const resolve of waiters) {
        resolve(undefined);
      }
    }
    this._wakeStreams();
  }

  /**
   * Resolve with the first value ever sent. Waits if none has arrived yet;
   * resolves `undefined` if the channel closes without a value.
   */
  first(): Promise<T | undefined> {
    if (this._hasValue) {
      return Promise.resolve(this._buffer[0]);
    }
    if (this._closed) {
      return Promise.resolve(undefined);
    }
    return new Promise<T | undefined>((resolve) => {
      this._firstWaiters.push(resolve);
    });
  }

  /**
   * Replaying async iterator: yields the full value history (from index 0)
   * then live values, ending when the channel is closed and drained.
   */
  async *stream(): AsyncGenerator<T> {
    let cursor = 0;
    for (;;) {
      while (cursor < this._buffer.length) {
        yield this._buffer[cursor];
        cursor += 1;
      }
      if (this._closed) {
        return;
      }
      await new Promise<void>((resolve) => {
        this._streamWaiters.push(resolve);
      });
    }
  }

  private _wakeStreams(): void {
    const waiters = this._streamWaiters;
    this._streamWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}
