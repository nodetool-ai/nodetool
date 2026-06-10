/**
 * Streaming channels for named, many-to-many, graph-independent communication.
 *
 * Port of src/nodetool/workflows/channel.py.
 *
 * Architecture:
 * - Queue-per-Subscriber: Each subscriber gets its own buffer for isolation.
 * - Broadcast Pattern: Publishing pushes to all subscriber buffers.
 * - Backpressure via buffer limits per subscriber queue.
 */

import { createLogger } from "@nodetool-ai/config";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.kernel.channel");

// ---------------------------------------------------------------------------
// Deferred – a tiny promise that can be resolved externally
// ---------------------------------------------------------------------------

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (val: T) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (val: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// Stop sentinel
// ---------------------------------------------------------------------------

const STOP_SIGNAL: unique symbol = Symbol("STOP_SIGNAL");

// ---------------------------------------------------------------------------
// ChannelStats
// ---------------------------------------------------------------------------

export interface ChannelStats {
  name: string;
  subscriberCount: number;
  isClosed: boolean;
  messageType?: unknown;
}

// ---------------------------------------------------------------------------
// SubscriberQueue – per-subscriber state
// ---------------------------------------------------------------------------

interface SubscriberQueue<T> {
  buffer: (T | typeof STOP_SIGNAL)[];
  waiters: Array<Deferred<void>>;
  /** Items dropped because the buffer was at capacity. */
  dropped: number;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export class Channel<T = unknown> {
  readonly name: string;
  private _subscribers = new Map<string, SubscriberQueue<T>>();
  private _closed = false;
  private _messageType?: new (...args: unknown[]) => T;
  private _bufferLimit: number;

  constructor(
    name: string,
    bufferLimit = 100,
    messageType?: new (...args: unknown[]) => T
  ) {
    this.name = name;
    this._bufferLimit = bufferLimit;
    this._messageType = messageType;
  }

  get messageType(): (new (...args: unknown[]) => T) | undefined {
    return this._messageType;
  }

  get isClosed(): boolean {
    return this._closed;
  }

  async publish(item: T): Promise<void> {
    if (this._closed) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.error("Publish to closed channel", { channel: this.name });
      throw new Error(`Channel ${this.name} is closed`);
    }

    if (
      this._messageType !== undefined &&
      !(item instanceof this._messageType)
    ) {
      throw new TypeError(
        `Channel '${this.name}' expects messages of type ${this._messageType.name}, got ${typeof item}`
      );
    }

    for (const [subscriberId, sub] of this._subscribers) {
      // Bounded queue: a stalled subscriber must not grow its buffer without
      // bound for the channel's lifetime. Drop the oldest item to make room
      // (broadcast semantics — one slow consumer must not stall the others).
      if (sub.buffer.length >= this._bufferLimit) {
        sub.buffer.shift();
        sub.dropped++;
        if (sub.dropped === 1) {
          // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
          log.warn("Subscriber buffer full — dropping oldest items", {
            channel: this.name,
            subscriberId,
            bufferLimit: this._bufferLimit
          });
        }
      }
      sub.buffer.push(item);
      // Wake any waiting consumer
      for (const w of sub.waiters.splice(0)) {
        w.resolve();
      }
    }
  }

  async *subscribe(subscriberId: string): AsyncGenerator<T> {
    // Stryker disable next-line ConditionalExpression: equivalent — without this early return the closed check at the wait branch yields the same empty result (the subscriber registers then immediately breaks)
    if (this._closed) return;

    // Replacing a live subscriber's queue would strand the old generator
    // forever (publish/close never touch the evicted queue, so a consumer
    // awaiting it never even receives the stop signal).
    if (this._subscribers.has(subscriberId)) {
      throw new Error(
        `Channel '${this.name}' already has an active subscriber '${subscriberId}'`
      );
    }

    const sub: SubscriberQueue<T> = { buffer: [], waiters: [], dropped: 0 };
    this._subscribers.set(subscriberId, sub);

    try {
      while (true) {
        if (sub.buffer.length > 0) {
          const item = sub.buffer.shift()!;
          if (item === STOP_SIGNAL) break;
          yield item as T;
          continue;
        }
        // Nothing buffered – wait for data
        // Stryker disable next-line ConditionalExpression: equivalent — close() always pushes STOP_SIGNAL into a registered subscriber's buffer (handled above) and new subscribers return early, so this branch is never reached with _closed === true
        if (this._closed) break;
        const d = deferred<void>();
        sub.waiters.push(d);
        await d.promise;
      }
    } finally {
      this._subscribers.delete(subscriberId);
    }
  }

  async close(): Promise<void> {
    this._closed = true;
    for (const sub of this._subscribers.values()) {
      sub.buffer.push(STOP_SIGNAL);
      for (const w of sub.waiters.splice(0)) {
        w.resolve();
      }
    }
  }

  getStats(): ChannelStats {
    return {
      name: this.name,
      subscriberCount: this._subscribers.size,
      isClosed: this._closed,
      messageType: this._messageType
    };
  }
}

// ---------------------------------------------------------------------------
// ChannelManager
// ---------------------------------------------------------------------------

export class ChannelManager {
  private _channels = new Map<string, Channel<unknown>>();
  private _channelTypes = new Map<string, unknown>();

  getChannel(name: string): Channel<unknown> | undefined {
    return this._channels.get(name);
  }

  async createChannel<T = unknown>(
    name: string,
    bufferLimit = 100,
    replace = false,
    messageType?: new (...args: unknown[]) => T
  ): Promise<Channel<T>> {
    if (this._channels.has(name) && !replace) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.error("Channel already exists", { channel: name });
      throw new Error(`Channel '${name}' already exists`);
    }

    if (this._channels.has(name)) {
      await this._channels.get(name)!.close();
    }

    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.debug("Channel created", { channel: name, bufferLimit });
    const channel = new Channel<T>(name, bufferLimit, messageType);
    this._channels.set(name, channel as unknown as Channel<unknown>);
    // Stryker disable next-line ConditionalExpression: forcing this true is equivalent — set(name, undefined) and the else delete both make getChannelType() / lookups return undefined (no consumer uses _channelTypes.has)
    if (messageType !== undefined) {
      this._channelTypes.set(name, messageType);
    } else {
      this._channelTypes.delete(name);
    }
    return channel;
  }

  async getOrCreateChannel<T = unknown>(
    name: string,
    bufferLimit = 100,
    messageType?: new (...args: unknown[]) => T
  ): Promise<Channel<T>> {
    if (!this._channels.has(name)) {
      const channel = new Channel<T>(name, bufferLimit, messageType);
      this._channels.set(name, channel as unknown as Channel<unknown>);
      // Stryker disable next-line ConditionalExpression: forcing this true is equivalent — set(name, undefined) is indistinguishable from leaving it unset for every _channelTypes consumer (all use get(), never has())
      if (messageType !== undefined) {
        this._channelTypes.set(name, messageType);
      }
    } else {
      const existingType = this._channelTypes.get(name);
      if (
        messageType !== undefined &&
        existingType !== undefined &&
        messageType !== existingType
      ) {
        throw new TypeError(
          `Channel '${name}' has type ${(existingType as { name: string }).name}, but ${messageType.name} was requested`
        );
      }
    }
    return this._channels.get(name)! as unknown as Channel<T>;
  }

  getChannelType(name: string): unknown {
    return this._channelTypes.get(name);
  }

  async publish(name: string, item: unknown, bufferLimit = 100): Promise<void> {
    const channel = await this.getOrCreateChannel(name, bufferLimit);
    await channel.publish(item);
  }

  async publishTyped<T>(
    name: string,
    item: T,
    messageType: new (...args: unknown[]) => T,
    bufferLimit = 100
  ): Promise<void> {
    const channel = await this.getOrCreateChannel<T>(
      name,
      bufferLimit,
      messageType
    );
    await channel.publish(item);
  }

  async *subscribe(
    name: string,
    subscriberId: string,
    bufferLimit = 100
  ): AsyncGenerator<unknown> {
    const channel = await this.getOrCreateChannel(name, bufferLimit);
    yield* channel.subscribe(subscriberId);
  }

  async *subscribeTyped<T>(
    name: string,
    subscriberId: string,
    messageType: new (...args: unknown[]) => T,
    bufferLimit = 100
  ): AsyncGenerator<T> {
    const channel = await this.getOrCreateChannel<T>(
      name,
      bufferLimit,
      messageType
    );
    yield* channel.subscribe(subscriberId);
  }

  async closeChannel(name: string): Promise<void> {
    const channel = this._channels.get(name);
    if (channel) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.debug("Channel closed", { channel: name });
      await channel.close();
      this._channels.delete(name);
      this._channelTypes.delete(name);
    }
  }

  async closeAll(): Promise<void> {
    for (const channel of this._channels.values()) {
      await channel.close();
    }
    this._channels.clear();
    this._channelTypes.clear();
  }

  listChannels(): string[] {
    return Array.from(this._channels.keys());
  }

  getAllStats(): ChannelStats[] {
    return Array.from(this._channels.values()).map((ch) => ch.getStats());
  }
}
