/**
 * Decides when the cloud window sends a document's waiting changes through
 * the editor's own save, for an editor that would otherwise save only on
 * command or on a long timer, such as the workflow editor (FR9, AC76).
 *
 * A save is due once the edits are in the local drafts store, the computer
 * is online and no save of this document is running. After a save that left
 * edits unsent the next one waits twice as long, from SEND_DELAY_MS up to
 * SEND_MAX_DELAY_MS, so a refused or failing save is not repeated every tick.
 * Coming back online makes a save due at once.
 *
 * Thread affinity: the renderer's event loop. One pacer per open document.
 */
export const SEND_DELAY_MS = 2_000;
export const SEND_MAX_DELAY_MS = 60_000;

export class CloudSendPacer {
  private nextMs = 0;
  private delayMs = SEND_DELAY_MS;
  private sending = false;

  /** Whether to start a save now. `stored` is true when the editor's latest edits are in the drafts store. */
  due(nowMs: number, stored: boolean, online: boolean): boolean {
    return stored && online && !this.sending && nowMs >= this.nextMs;
  }

  started(): void {
    this.sending = true;
  }

  /** The save ended. `unsent` is true when the editor still holds edits the server has not taken. */
  finished(nowMs: number, unsent: boolean): void {
    this.sending = false;
    if (unsent) {
      this.nextMs = nowMs + this.delayMs;
      this.delayMs = Math.min(this.delayMs * 2, SEND_MAX_DELAY_MS);
    } else {
      this.nextMs = nowMs + SEND_DELAY_MS;
      this.delayMs = SEND_DELAY_MS;
    }
  }

  /** The computer came back online: the next save is due at once. */
  reconnected(): void {
    this.nextMs = 0;
    this.delayMs = SEND_DELAY_MS;
  }
}
