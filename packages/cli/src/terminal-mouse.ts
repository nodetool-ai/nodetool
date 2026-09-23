import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export interface MouseEvent {
  readonly action: "down" | "move" | "up" | "wheel";
  readonly x: number;
  readonly y: number;
  readonly direction?: -1 | 1;
}

const ESC = String.fromCharCode(27);
const MOUSE_PREFIX = `${ESC}[<`;

export class MouseInput extends PassThrough {
  readonly events = new EventEmitter();
  readonly isTTY: boolean;
  private pending = "";
  private readonly decoder = new StringDecoder("utf8");
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly source: NodeJS.ReadStream) {
    super();
    this.isTTY = Boolean(source.isTTY);
    source.on("data", this.receive);
  }

  get isRaw(): boolean {
    return Boolean(this.source.isRaw);
  }

  setRawMode(raw: boolean): this {
    this.source.setRawMode(raw);
    return this;
  }

  ref(): this {
    this.source.ref();
    return this;
  }

  unref(): this {
    this.source.unref();
    return this;
  }

  close(): void {
    this.source.off("data", this.receive);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.end();
  }

  private readonly receive = (chunk: Buffer | string): void => {
    this.pending += Buffer.isBuffer(chunk) ? this.decoder.write(chunk) : chunk;
    let keyboard = "";
    while (this.pending) {
      const start = this.pending.indexOf(MOUSE_PREFIX);
      if (start < 0) {
        const possible = [MOUSE_PREFIX, `${ESC}[`, ESC].find((prefix) => this.pending.endsWith(prefix)) ?? "";
        keyboard += this.pending.slice(0, this.pending.length - possible.length);
        this.pending = possible;
        break;
      }
      keyboard += this.pending.slice(0, start);
      this.pending = this.pending.slice(start);
      const match = /^(\d+);(\d+);(\d+)([Mm])/.exec(this.pending.slice(MOUSE_PREFIX.length));
      if (match) {
        this.pending = this.pending.slice(MOUSE_PREFIX.length + match[0].length);
        const code = Number(match[1]);
        const x = Number(match[2]);
        const y = Number(match[3]);
        if (code === 64 || code === 65) {
          this.events.emit("mouse", { action: "wheel", x, y, direction: code === 64 ? -1 : 1 } satisfies MouseEvent);
        } else if ((code & 3) === 0 || match[4] === "m") {
          this.events.emit("mouse", { action: match[4] === "m" ? "up" : (code & 32) ? "move" : "down", x, y } satisfies MouseEvent);
        }
        continue;
      }
      if (/^[\d;]*$/.test(this.pending.slice(MOUSE_PREFIX.length))) break;
      keyboard += this.pending[0];
      this.pending = this.pending.slice(1);
    }
    if (keyboard) this.write(keyboard);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.pending) {
      this.flushTimer = setTimeout(() => {
        this.write(this.pending);
        this.pending = "";
      }, 40);
    }
  };
}
