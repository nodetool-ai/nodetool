export interface ChatPrompt {
  readonly title: string;
  readonly body: string;
  readonly choices: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: string;
  }[];
}

/** Serialize requests from parallel tools without leaving promises behind on cancellation. */
export class ChatPrompts {
  private readonly pending: Array<{
    prompt: ChatPrompt;
    settle: (answer: string) => void;
  }> = [];
  constructor(private readonly show: (prompt: ChatPrompt | null) => void) {}

  ask(prompt: ChatPrompt, signal: AbortSignal): Promise<string> {
    if (signal.aborted) {
      return Promise.resolve("cancel");
    }
    return new Promise((resolve) => {
      const entry = {
        prompt,
        settle: (answer: string): void => {
          signal.removeEventListener("abort", abort);
          const index = this.pending.indexOf(entry);
          if (index < 0) {
            return;
          }
          this.pending.splice(index, 1);
          this.show(this.pending[0]?.prompt ?? null);
          resolve(answer);
        }
      };
      const abort = (): void => entry.settle("cancel");
      this.pending.push(entry);
      signal.addEventListener("abort", abort, { once: true });
      if (this.pending.length === 1) {
        this.show(prompt);
      }
    });
  }

  answer(answer: string): void {
    this.pending[0]?.settle(answer);
  }
}
