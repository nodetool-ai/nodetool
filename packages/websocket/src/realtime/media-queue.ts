export interface BoundedMediaQueueOptions {
  capacity: number;
}

export interface BoundedMediaQueueMetrics {
  depth: number;
  dropped: number;
  pushed: number;
}

export class BoundedMediaQueue<T> {
  private readonly capacity: number;
  private readonly items: T[] = [];
  private dropped = 0;
  private pushed = 0;

  constructor(options: BoundedMediaQueueOptions) {
    this.capacity = Math.max(1, Math.floor(options.capacity));
  }

  push(item: T): void {
    this.pushed += 1;
    if (this.items.length >= this.capacity) {
      this.items.shift();
      this.dropped += 1;
    }
    this.items.push(item);
  }

  shift(): T | undefined {
    return this.items.shift();
  }

  snapshot(): T[] {
    return [...this.items];
  }

  metrics(): BoundedMediaQueueMetrics {
    return {
      depth: this.items.length,
      dropped: this.dropped,
      pushed: this.pushed
    };
  }
}
