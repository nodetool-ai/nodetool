/** Fixed tick accumulation shared by editor and standalone game hosts. */
export class FixedTickClock {
  private previous: number | null = null;
  private accumulator = 0;

  constructor(private readonly tickRate: number) {}

  reset(): void { this.previous = null; this.accumulator = 0; }

  advance(now: number, step: () => void): number {
    if (this.previous === null) { this.previous = now; }
    this.accumulator += Math.max(0, Math.min(now - this.previous, 250));
    this.previous = now;
    const tickMs = 1000 / this.tickRate;
    let count = 0;
    while (this.accumulator >= tickMs && count < 5) {
      step();
      this.accumulator -= tickMs;
      count += 1;
    }
    if (count === 5) { this.accumulator = 0; }
    return this.accumulator / tickMs;
  }
}
