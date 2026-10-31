import { spawn } from "node:child_process";

/** Copy locally when a clipboard program is available, then use OSC 52 as fallback. */
export async function copyTerminalText(
  value: string,
  output: NodeJS.WriteStream,
  platform = process.platform
): Promise<void> {
  const candidates = platform === "darwin"
    ? [["pbcopy"]]
    : platform === "win32"
      ? [["clip"]]
      : [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]];
  for (const [command, ...args] of candidates) {
    if (!command) continue;
    const copied = await new Promise<boolean>((resolve) => {
      const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
      child.stdin.on("error", () => resolve(false));
      child.stdin.end(value);
    });
    if (copied) return;
  }
  output.write(`\u001b]52;c;${Buffer.from(value).toString("base64")}\u0007`);
}
