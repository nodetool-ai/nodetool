import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { packageManagerInvocation } from "../package-manager.mjs";

it("executes Windows package-manager arguments literally through the current Node", () => {
  const root = mkdtempSync(join(tmpdir(), "package manager "));
  try {
    const cli = join(root, "npm-cli.js");
    for (const name of ["npm-cli.js", "npx-cli.js"]) {
      writeFileSync(join(root, name), "console.log(JSON.stringify(process.argv.slice(2)))");
    }
    const args = ["pack", "path with spaces", "a&b", "$(not-a-command)", "%PATH%"];
    for (const manager of ["npm", "npx"]) {
      for (const key of ["npm_execpath", "NPM_EXECPATH"]) {
        const invocation = packageManagerInvocation(manager, args, { [key]: cli }, "win32");
        const result = execFileSync(invocation.command, invocation.args, { encoding: "utf8" });
        expect(JSON.parse(result)).toEqual(args);
      }
    }
    expect(packageManagerInvocation("npm", args, {}, "linux")).toEqual({ command: "npm", args });
    expect(() => packageManagerInvocation("node", [])).toThrow("Not a package manager");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
