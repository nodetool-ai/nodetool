import { dirname, join } from "node:path";

// Windows cannot exec npm.cmd/npx.cmd without a shell. Launch their JS entry
// through the current Node executable so arguments remain separate and literal.
export function packageManagerInvocation(command, args, env = process.env, platform = process.platform) {
  if (command !== "npm" && command !== "npx") {
    throw new Error(`Not a package manager: ${command}`);
  }
  if (platform !== "win32") {
    return { command, args };
  }
  const npmKey = Object.keys(env).find(key => key.toLowerCase() === "npm_execpath");
  const npm = (npmKey ? env[npmKey] : undefined)
    ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const entry = command === "npm" ? npm : join(dirname(npm), "npx-cli.js");
  return { command: process.execPath, args: [entry, ...args] };
}
