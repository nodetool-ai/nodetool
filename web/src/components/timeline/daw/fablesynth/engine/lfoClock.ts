// Continuous phase under live rate edits; backwards time restarts the clock.
export class LfoClock {
  private ready = false;
  private position = 0;
  private rate = 0;
  private cycles = 0;
  reset(): void { this.ready = false; }
  update(position: number, rate: number): number {
    if (!this.ready || position < this.position) {
      this.cycles = position * rate;
      this.ready = true;
    } else this.cycles += (position - this.position) * this.rate;
    this.position = position;
    this.rate = rate;
    return this.cycles;
  }
  phase(position: number, rate: number): number {
    const c = this.update(position, rate);
    return c - Math.floor(c);
  }
}
