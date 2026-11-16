/**
 * US4 of the project folders PRD: an agent that works in a project folder
 * lists, reads and writes it, and a write into `.nodetool/` is refused. The
 * `Workspace` and JS-script levels are tested elsewhere. This drives the agent
 * file capabilities (`write_file`, `read_file`, `list_directory`) through
 * `run.invoke` over a real temporary folder with a `.nodetool/` in it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import type { CapabilityRun } from "../src/capabilities/types.js";

let folder: string;

function runFor(dir: string): CapabilityRun {
  const variables = new Map<string, unknown>();
  const context = {
    workspace: createLocalWorkspace(dir),
    threadId: "thread-reserved-dir",
    workflowId: null,
    get<T>(key: string): T | undefined {
      return variables.get(key) as T | undefined;
    },
    set(key: string, value: unknown): void {
      variables.set(key, value);
    },
    resolveWorkspacePath(path: string): string {
      return join(dir, path);
    },
    postMessage(): void {
      // The messages are not part of this test.
    }
  } as unknown as ProcessingContext;
  return createCapabilityRun({ context, gate: UNGATED });
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "agent-reserved-dir-"));
  await mkdir(join(folder, ".nodetool"));
  await writeFile(join(folder, ".nodetool", "project.json"), '{"id":"p"}');
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("agent file tools and the reserved .nodetool/ directory (US4)", () => {
  it("writes an ordinary file of the folder", async () => {
    const run = runFor(folder);

    await run.invoke("write_file", { file_path: "Notes/plan.md", content: "plan" });

    expect(await readFile(join(folder, "Notes", "plan.md"), "utf8")).toBe("plan");
  });

  it.each([
    ".nodetool/evil.json",
    ".nodetool/project.json",
    "./.nodetool/evil.json",
    "Notes/../.nodetool/evil.json",
    ".nodetool\\evil.json"
  ])("refuses write_file to %s and leaves the folder unchanged", async (path) => {
    const run = runFor(folder);

    const result = await run.invoke("write_file", { file_path: path, content: "x" });

    expect(String(result)).toMatch(/^Error: .*reserves for its own files/);

    expect(existsSync(join(folder, ".nodetool", "evil.json"))).toBe(false);
    expect(await readFile(join(folder, ".nodetool", "project.json"), "utf8")).toBe(
      '{"id":"p"}'
    );
  });

  it("refuses to read .nodetool/ and keeps it out of directory listings", async () => {
    const run = runFor(folder);
    await writeFile(join(folder, "visible.txt"), "v");

    const read = await run.invoke("read_file", { file_path: ".nodetool/project.json" });
    expect(String(read)).toMatch(/^Error: .*reserves for its own files/);

    const listing = String(await run.invoke("list_directory", { path: "." }));
    expect(listing).toContain("visible.txt");
    expect(listing).not.toContain(".nodetool");
  });
});
