import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/publish.yaml", import.meta.url), "utf8"));
const temporaryDirectories = [];
const normalOnly = "${{ env.RESUME_ORIGINAL_RUN_ID == '' }}";
const recoveryOnly = "${{ env.RESUME_ORIGINAL_RUN_ID != '' }}";

function selectedSteps(resume) {
  return workflow.jobs.publish.steps.filter(step => {
    if (!step.if) { return true; }
    if (step.if === normalOnly) { return !resume; }
    if (step.if === recoveryOnly) { return resume; }
    throw new Error(`Unrecognized release condition: ${step.if}`);
  });
}

function resolveVersion(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "release-workflow-"));
  temporaryDirectories.push(directory);
  const environmentFile = join(directory, "github-env");
  const result = spawnSync("bash", ["-c", workflow.jobs.publish.steps.find(step => step.name === "Resolve version").run], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/tags/cli-pack-rehearsal-a24.1",
      GITHUB_REF_NAME: "cli-pack-rehearsal-a24.1",
      GITHUB_ENV: environmentFile,
      INPUT_VERSION: "0.8.4-a24.1",
      RESUME_ORIGINAL_RUN_ID: "",
      ...overrides
    }
  });
  return { ...result, environmentFile };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) { rmSync(directory, { recursive: true, force: true }); }
});

describe("release workflow recovery", () => {
  it("keeps normal publication behind both packed smoke tests", () => {
    const steps = selectedSteps(false);
    const commands = steps.map(step => step.run ?? "");
    const packed = steps.findIndex(step => step.name === "Pack release tarballs once");
    const smoke = steps.findIndex(step => step.name === "Smoke-test the packed CLI");
    const coreSmoke = steps.findIndex(step => step.name === "Smoke-test the packed core-only CLI");
    const publish = steps.findIndex(step => step.name === "Publish staging artifacts with trusted publishing");
    expect(commands).toContain("npm ci");
    expect(packed).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(packed);
    expect(coreSmoke).toBeGreaterThan(smoke);
    expect(publish).toBeGreaterThan(coreSmoke);
    expect(steps.some(step => step.name === "Recover original published artifacts")).toBe(false);
  });

  it("installs tooling before restoring original bytes without rebuilding or publishing", () => {
    const steps = selectedSteps(true);
    const commands = steps.map(step => step.run ?? "").join("\n");
    expect(commands).not.toMatch(/bump-version|build:packages|prepare-publish|publish-packages|smoke-packed-cli/);
    const install = steps.findIndex(step => step.name === "Install dependencies");
    expect(install).toBeGreaterThan(-1);
    expect(steps[install].run).toBe("npm ci");
    expect(steps.findIndex(step => step.name === "Recover original published artifacts")).toBeGreaterThan(install);
    const recovery = steps.find(step => step.name === "Recover original published artifacts");
    expect(recovery.run).toBe('node scripts/release/recover-staging.mjs --original-run-id "$RESUME_ORIGINAL_RUN_ID" --version "$VERSION_NO_V" --tarballs-dir .release-tarballs');
    expect(recovery.env.GH_TOKEN).toBe("${{ github.token }}");
    expect(workflow.jobs.publish.permissions.actions).toBe("read");
    expect(workflow.jobs.publish.env.RESUME_ORIGINAL_RUN_ID).toBe("${{ inputs.resume_original_run_id }}");
    const promotion = steps.findIndex(step => step.name === "Verify staging and promote final tags with CLI last");
    expect(promotion).toBeGreaterThan(steps.indexOf(recovery));
    expect(steps[promotion].run).toContain('--catalog "$RELEASE_CATALOG"');
    expect(steps.findIndex(step => step.name === "Record published version")).toBeGreaterThan(promotion);
    expect(workflow.jobs.smoke.needs).toBe("publish");
  });

  it("selects the original catalog and prerelease tag for recovery", () => {
    const result = resolveVersion({ RESUME_ORIGINAL_RUN_ID: "38866952895" });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(result.environmentFile, "utf8")).toContain("RELEASE_CATALOG=.release-tarballs/catalog.json\n");
    expect(readFileSync(result.environmentFile, "utf8")).toContain("NPM_TAG=a24\n");
    const normal = resolveVersion();
    expect(normal.status, normal.stderr).toBe(0);
    expect(readFileSync(normal.environmentFile, "utf8")).toContain("RELEASE_CATALOG=packages/node-catalog/data/index.json\n");
  });

  it.each([
    { RESUME_ORIGINAL_RUN_ID: "0" },
    { RESUME_ORIGINAL_RUN_ID: "123; exit 0" },
    { RESUME_ORIGINAL_RUN_ID: "123", INPUT_VERSION: "" },
    { RESUME_ORIGINAL_RUN_ID: "123", GITHUB_REF: "refs/heads/unreviewed" }
  ])("rejects invalid recovery input before recording a release version: %j", input => {
    const result = resolveVersion(input);
    expect(result.status).toBe(1);
  });
});
