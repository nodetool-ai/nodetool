import { spawnSync } from "node:child_process";

export function runReleaseCommand(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 300_000, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout;
}
