/** A successfully completed explicit render in a standalone player. */
export interface GamePlayerRenderedFrame {
  readonly tick: number;
  /** Monotonic successful-render count for this player instance. */
  readonly frameNumber: number;
}
