import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const packageJsonPath = fileURLToPath(
  new URL("../../../package.json", import.meta.url)
);
const repoRoot = dirname(packageJsonPath);

const RootPackageJsonSchema = z.object({
  scripts: z.record(z.string(), z.string())
});

function parseNodeScriptArgs(scriptName: string): string[] {
  const manifest = RootPackageJsonSchema.parse(
    JSON.parse(readFileSync(packageJsonPath, "utf8"))
  );
  const command = manifest.scripts[scriptName];
  expect(command, `root package.json script "${scriptName}"`).toBeTruthy();
  const tokens = (command ?? "").trim().split(/\s+/);
  expect(tokens[0]).toBe("node");
  return tokens.slice(1);
}

describe("root package.json chat scripts", () => {
  for (const scriptName of ["chat", "dev:chat"] as const) {
    it(`executes the nodetool-chat CLI for npm run ${scriptName}`, async () => {
      const args = parseNodeScriptArgs(scriptName);
      const tempDir = await mkdtemp(join(tmpdir(), "nodetool-chat-script-"));
      try {
        const { stdout } = await execFileAsync(
          process.execPath,
          [...args, "--help"],
          {
            cwd: repoRoot,
            env: {
              ...process.env,
              NODETOOL_LOG_FILE: join(tempDir, "chat.log"),
              NODETOOL_LOG_LEVEL: "error"
            },
            timeout: 30_000
          }
        );
        expect(stdout).toContain("Usage: nodetool-chat");
        expect(stdout).toContain("--provider");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  }
});
