import type { ProcessingMessage } from "@nodetool/protocol";

/**
 * Keep enough recent runtime history for operator diagnostics without letting a
 * long-lived realtime session grow unbounded in memory.
 */
export const REALTIME_MESSAGE_BUFFER_LIMIT = 1024;

/**
 * Keep a small tail of the most recent output values per output node so
 * realtime-mode previews remain inspectable without accumulating every frame.
 */
export const REALTIME_OUTPUT_BUFFER_LIMIT = 256;

export class RealtimeRunBuffers {
  readonly messages: ProcessingMessage[] = [];
  readonly outputs = new Map<string, unknown[]>();

  appendMessage(message: ProcessingMessage): void {
    this.appendBounded(this.messages, message, REALTIME_MESSAGE_BUFFER_LIMIT);
  }

  appendOutputValue(name: string, value: unknown): void {
    if (!this.outputs.has(name)) {
      this.outputs.set(name, []);
    }
    this.appendBounded(
      this.outputs.get(name)!,
      value,
      REALTIME_OUTPUT_BUFFER_LIMIT
    );
  }

  clear(): void {
    this.messages.length = 0;
    this.outputs.clear();
  }

  private appendBounded<T>(values: T[], value: T, limit: number): void {
    values.push(value);
    if (values.length > limit) {
      values.splice(0, values.length - limit);
    }
  }
}
