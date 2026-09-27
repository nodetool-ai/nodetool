import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { skillTreeLinkProblem } from "../check-agents-docs.mjs";

test("agent skill tree requires .claude to link to the .agents directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-skills-"));
  try {
    await mkdir(join(root, ".agents"));
    await symlink(".agents", join(root, ".claude"));
    expect(await skillTreeLinkProblem(root)).toBeNull();

    await rm(join(root, ".claude"));
    await symlink("missing", join(root, ".claude"));
    expect(await skillTreeLinkProblem(root)).toMatch(/points at missing, not \.agents/);

    await rm(join(root, ".agents"), { recursive: true });
    expect(await skillTreeLinkProblem(root)).toMatch(/\.agents is missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
