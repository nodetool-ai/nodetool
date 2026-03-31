// Stub type declarations for node-pty (optional native dependency).
// The actual module is lazy-loaded at runtime; this satisfies tsc.
declare module "node-pty" {
  interface IPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  }
  interface IPty {
    readonly pid: number;
    readonly process: string;
    onData: (callback: (data: string) => void) => { dispose: () => void };
    onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
    write(data: string): void;
    resize(columns: number, rows: number): void;
    kill(signal?: string): void;
  }
  function spawn(file: string, args: string[], options: IPtyForkOptions): IPty;
}
