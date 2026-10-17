import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/release.yaml", import.meta.url), "utf8"));
const temporaryDirectories = [];

function git(directory, ...args) {
  const result = spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" });
  if (result.status !== 0) { throw new Error(result.stderr); }
  return result.stdout.trim();
}

function fixture(tagType = "annotated") {
  const directory = mkdtempSync(join(tmpdir(), "desktop-release-"));
  temporaryDirectories.push(directory);
  const origin = join(directory, "origin.git");
  const checkout = join(directory, "checkout");
  git(directory, "init", "--bare", origin);
  git(directory, "clone", origin, checkout);
  git(checkout, "config", "user.email", "release-test@example.com");
  git(checkout, "config", "user.name", "Release test");
  git(checkout, "commit", "--allow-empty", "-m", "Release source");
  const source = git(checkout, "rev-parse", "HEAD");
  if (tagType === "annotated") {
    git(checkout, "tag", "-a", "v0.8.4", "-m", "Immutable release");
  } else {
    git(checkout, "tag", "v0.8.4");
  }
  git(checkout, "push", "origin", "refs/tags/v0.8.4");
  git(checkout, "commit", "--allow-empty", "-m", "Later workflow repair");
  const head = git(checkout, "rev-parse", "HEAD");
  git(checkout, "push", "origin", "HEAD:refs/heads/main");
  git(checkout, "tag", "-d", "v0.8.4");
  return { directory, origin, checkout, source, head };
}

function preflight(repository, overrides = {}) {
  const output = join(repository.directory, "output");
  const trace = join(repository.directory, "git-trace");
  writeFileSync(output, "");
  writeFileSync(trace, "");
  const script = workflow.jobs.preflight.steps.find(step => step.id === "meta").run
    .replaceAll("${{ github.sha }}", repository.head)
    .replaceAll("${{ github.run_number }}", "37");
  const result = spawnSync("bash", ["-c", script], {
    cwd: repository.checkout,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REF_NAME: "main",
      GITHUB_SHA: repository.head,
      GITHUB_OUTPUT: output,
      GIT_TRACE: trace,
      INPUT_CHANNEL: "stable",
      INPUT_VERSION: "0.8.4",
      INPUT_SOURCE_TAG: "v0.8.4",
      ...overrides
    }
  });
  return {
    ...result,
    outputs: Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map(line => line.split("="))),
    trace: readFileSync(trace, "utf8")
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) { rmSync(directory, { recursive: true, force: true }); }
});

describe("desktop release recovery", () => {
  it.each(["annotated", "lightweight"])("resolves an existing %s tag to a pinned source commit", tagType => {
    const repository = fixture(tagType);
    const result = preflight(repository);
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.ref).toBe(repository.source);
    expect(result.outputs.tag).toBe("v0.8.4");
    expect(workflow.jobs.preflight.outputs.ref).toBe("${{ steps.meta.outputs.ref }}");
    git(repository.origin, "tag", "-f", "v0.8.4", repository.head);
    expect(git(repository.checkout, "rev-parse", result.outputs.ref)).toBe(repository.source);
  });

  it.each(["workflow_dispatch", "push"])("keeps the event commit for %s without recovery input", event => {
    const repository = fixture();
    const result = preflight(repository, {
      INPUT_SOURCE_TAG: "",
      INPUT_VERSION: event === "push" ? "" : "0.8.4",
      GITHUB_EVENT_NAME: event,
      GITHUB_REF: event === "push" ? "refs/tags/v0.8.4" : "refs/heads/main",
      GITHUB_REF_NAME: event === "push" ? "v0.8.4" : "main"
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.ref).toBe(repository.head);
    expect(result.trace).not.toContain("fetch");
  });

  it.each(["schedule", "workflow_dispatch"])("keeps the event commit for a %s nightly", event => {
    const repository = fixture();
    mkdirSync(join(repository.checkout, "scripts"));
    mkdirSync(join(repository.checkout, "electron"));
    copyFileSync(new URL("../resolve-nightly-release.mjs", import.meta.url), join(repository.checkout, "scripts/resolve-nightly-release.mjs"));
    writeFileSync(join(repository.checkout, "electron/package.json"), JSON.stringify({ version: "0.8.4" }));
    const result = preflight(repository, {
      GITHUB_EVENT_NAME: event,
      INPUT_CHANNEL: "nightly",
      INPUT_VERSION: "",
      INPUT_SOURCE_TAG: "",
      RUN_STARTED_AT: "2026-10-17T12:00:00Z"
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.ref).toBe(repository.head);
    expect(result.outputs.release_channel).toBe("nightly");
    expect(result.outputs.version).toBe("0.8.5-nightly.20261017.37");
    expect(result.trace).not.toContain("fetch");
  });

  it.each([
    { INPUT_CHANNEL: "nightly" },
    { INPUT_VERSION: "" },
    { INPUT_SOURCE_TAG: "v0.8.5" },
    { INPUT_SOURCE_TAG: "main" },
    { INPUT_SOURCE_TAG: "refs/heads/main" },
    { INPUT_SOURCE_TAG: "v0.8.4; exit 0" },
    { INPUT_SOURCE_TAG: "v0.8.4-nightly.1", INPUT_VERSION: "0.8.4-nightly.1" },
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REF: "refs/heads/unreviewed" }
  ])("rejects invalid recovery input before fetching: %j", input => {
    const result = preflight(fixture(), input);
    expect(result.status).toBe(1);
    expect(result.trace).not.toContain("fetch");
    expect(result.outputs.ref).toBeUndefined();
  });

  it("refuses a matching branch when the requested tag does not exist", () => {
    const repository = fixture();
    git(repository.checkout, "push", "origin", "HEAD:refs/heads/v0.8.5");
    const result = preflight(repository, { INPUT_VERSION: "0.8.5", INPUT_SOURCE_TAG: "v0.8.5" });
    expect(result.status).not.toBe(0);
    expect(result.outputs.ref).toBeUndefined();
  });

  it("uses workflow smoke tooling with the pinned build and SDK provenance", () => {
    const steps = workflow.jobs["release-build"].steps;
    const checkouts = steps.filter(step => step.uses?.startsWith("actions/checkout@"));
    expect(checkouts[0].with.ref).toBe("${{ needs.preflight.outputs.ref }}");
    expect(checkouts[1].with).toMatchObject({
      ref: "${{ github.sha }}",
      path: ".release-tools",
      "sparse-checkout": "scripts/smoke-backend-bundle.mjs",
      "sparse-checkout-cone-mode": false
    });
    const smokeSteps = steps.filter(step => step.name?.startsWith("Smoke-boot packaged backend"));
    expect(smokeSteps).toHaveLength(2);
    for (const step of smokeSteps) {
      expect(step.run).toContain("node .release-tools/scripts/smoke-backend-bundle.mjs ");
    }
    expect(steps.find(step => step.name === "Build SDK contract bundle").run)
      .toContain('--commit "${{ needs.preflight.outputs.ref }}"');
    expect(workflow.jobs["publish-release"].steps.find(step => step.name === "Publish release").with.target_commitish)
      .toBe("${{ needs.preflight.outputs.ref }}");
  });
});
