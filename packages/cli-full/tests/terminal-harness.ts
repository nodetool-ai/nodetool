import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { render } from "ink";
import type React from "react";

class TerminalInput extends PassThrough {
  isTTY = true;
  isRaw = false;
  setRawMode(raw: boolean): this {
    this.isRaw = raw;
    return this;
  }
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
}
class TerminalOutput extends PassThrough {
  isTTY = true;
  columns = 100;
  rows = 30;
}

export function renderTerminal(
  element: React.ReactNode,
  columns = 100,
  rows = 30
) {
  const stdin = new TerminalInput();
  const stdout = new TerminalOutput();
  stdout.columns = columns;
  stdout.rows = rows;
  let last = "";
  stdout.on("data", (chunk: Buffer) => {
    const text = stripVTControlCharacters(chunk.toString());
    if (text.trim()) last = text;
  });
  const instance = render(element, {
    // These streams implement the TTY methods Ink uses without taking over the test runner's terminal.
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
    kittyKeyboard: { mode: "disabled" }
  });
  return {
    instance,
    stdin,
    stdout,
    frame: (): string => last,
    close: (): void => {
      instance.unmount();
      instance.cleanup();
      stdin.destroy();
      stdout.destroy();
    }
  };
}
