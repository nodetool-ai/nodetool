/**
 * Jest mock for @xterm/xterm. The real Terminal measures fonts and renders to
 * canvas/DOM in ways jsdom can't support; tests only need to observe the
 * calls NodeTerminal makes.
 */
/** The `ITerminalOptions` subset NodeTerminal constructs a terminal with. */
export interface TerminalOptions {
  cols?: number;
  rows?: number;
  disableStdin?: boolean;
  scrollback?: number;
  fontSize?: number;
  fontFamily?: string;
  theme?: { background?: string };
}

export class Terminal {
  options: TerminalOptions;
  written: string[] = [];
  cols: number;
  rows: number;
  disposed = false;
  resetCount = 0;

  constructor(options: TerminalOptions = {}) {
    this.options = options;
    this.cols = Number(options.cols ?? 80);
    this.rows = Number(options.rows ?? 24);
  }

  open(_parent: HTMLElement): void {
    // No-op in jsdom
  }

  write(data: string): void {
    this.written.push(data);
  }

  reset(): void {
    this.resetCount += 1;
    this.written = [];
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }

  dispose(): void {
    this.disposed = true;
  }
}
