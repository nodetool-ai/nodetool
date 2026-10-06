import { isRecord } from "../../../utils/typePredicates";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

export const INPUT_STATE_KEY = "__app_inputs";
export const OUTPUT_STATE_KEY = "__app_outputs";

/** Widget-local view state and invocation ownership never cross the boundary. */
export const instanceValues = (
  state: AppInstanceState
): Record<string, unknown> => ({
  ...state.variables,
  [INPUT_STATE_KEY]: Object.fromEntries(
    Object.entries(state.inputs).map(([key, slot]) => [key, slot.value])
  ),
  [OUTPUT_STATE_KEY]: Object.fromEntries(
    Object.entries(state.outputs).map(([key, slot]) => [key, slot.value])
  )
});

const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

export const restoredInstanceValues = (
  values: Record<string, unknown>
): Pick<AppInstanceState, "variables" | "inputs" | "outputs"> => {
  const {
    [INPUT_STATE_KEY]: inputs,
    [OUTPUT_STATE_KEY]: outputs,
    ...variables
  } = values;
  return {
    variables,
    inputs: Object.fromEntries(
      Object.entries(record(inputs)).map(([key, value]) => [
        key,
        { value, dirty: false, revision: 0 }
      ])
    ),
    outputs: Object.fromEntries(
      Object.entries(record(outputs)).map(([key, value]) => [
        key,
        { value, invocationId: null, status: "done", revision: 0 }
      ])
    )
  };
};

/** Serialize CAS writes. A conflict stops the queue instead of overwriting newer state. */
export class InstanceWriter {
  private revision: number;
  private saved: string;
  private pending: Record<string, unknown> | null = null;
  private saving: Promise<void> | null = null;
  private failure: Error | null = null;

  constructor(
    revision: number,
    values: Record<string, unknown>,
    private readonly save: (
      revision: number,
      values: Record<string, unknown>
    ) => Promise<number>
  ) {
    this.revision = revision;
    this.saved = JSON.stringify(values);
  }

  adopt(
    revision: number,
    values: Record<string, unknown>,
    current: Record<string, unknown>
  ): boolean {
    if (this.saving || this.failure || JSON.stringify(current) !== this.saved) {
      return false;
    }
    this.revision = revision;
    this.saved = JSON.stringify(values);
    this.pending = null;
    return true;
  }

  stage(values: Record<string, unknown>): void {
    this.pending = values;
  }

  flush(): Promise<void> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    if (this.saving) {
      return this.saving;
    }
    this.saving = this.drain().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const values = this.pending;
      this.pending = null;
      const serialized = JSON.stringify(values);
      if (serialized === this.saved) {
        continue;
      }
      try {
        this.revision = await this.save(this.revision, values);
        this.saved = serialized;
      } catch (error) {
        this.failure =
          error instanceof Error ? error : new Error(String(error));
        throw this.failure;
      }
    }
  }
}
