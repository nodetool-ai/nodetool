import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const workflow = (name) => parse(readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8"));

test("Docker releases preserve the build gates and cannot cancel a rolling deployment", () => {
  const server = workflow("fly-deploy.yml");
  assert.equal(server.name, "Deploy to Docker");
  assert.deepEqual(server.on.workflow_run.workflows, ["Docker", "User Journeys", "Test"]);
  assert.equal(server.concurrency["cancel-in-progress"], false);
  assert.equal(server.jobs.deploy.name, "Deploy server");
  assert.ok(server.jobs.deploy.needs.includes("gate"));
  const gate = server.jobs.gate.steps.map((step) => step.run ?? "").join("\n");
  assert.ok(gate.includes("docker.yml") && gate.includes("user-journeys.yml") && gate.includes("test.yml"));
  assert.ok(gate.includes("event=push"));
  const release = server.jobs.deploy.steps.map((step) => step.run ?? "").join("\n");
  assert.ok(release.includes("StrictHostKeyChecking=yes"));
  assert.ok(release.includes("BatchMode=yes"));
  assert.ok(release.includes('"$DEPLOY_SHA"'));
  assert.equal(release.includes("flyctl"), false);
  assert.equal(JSON.stringify(server).includes("FLY_API_TOKEN"), false);
  assert.equal(JSON.stringify(server).includes(":latest"), false);
});

// Runs the gate step with a stub gh that reports the given workflow conclusions.
function runGate({ docker, journeys, test: testConclusion, skipTestGate }) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-gate-"));
  try {
    const sha = "a".repeat(40);
    writeFileSync(
      join(dir, "gh"),
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        `  *commits/main*) echo ${sha} ;;`,
        `  *docker.yml*) echo ${docker} ;;`,
        `  *user-journeys.yml*) echo ${journeys} ;;`,
        `  *test.yml*) echo ${testConclusion} ;;`,
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(join(dir, "gh"), 0o755);
    const output = join(dir, "output");
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", workflow("fly-deploy.yml").jobs.gate.steps[0].run], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        RELEASE_SHA: sha,
        RELEASE_REPO: "owner/repo",
        SKIP_TEST_GATE: String(skipTestGate),
        GITHUB_OUTPUT: output,
      },
    });
    return { status: result.status, deploy: /deploy=true/.test(readFileSync(output, "utf8")), stdout: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("skip_test_gate waives a failed Test run on manual dispatch only", () => {
  const server = workflow("fly-deploy.yml");
  assert.equal(server.on.workflow_dispatch.inputs.skip_test_gate.default, false);
  assert.ok(server.jobs.gate.env.SKIP_TEST_GATE.includes("github.event_name == 'workflow_dispatch'"));

  const refused = runGate({ docker: "success", journeys: "success", test: "failure", skipTestGate: false });
  assert.equal(refused.status, 1);
  assert.equal(refused.deploy, false);

  const waived = runGate({ docker: "success", journeys: "success", test: "failure", skipTestGate: true });
  assert.equal(waived.status, 0);
  assert.equal(waived.deploy, true);
  assert.ok(waived.stdout.includes("skip_test_gate"));

  const dockerFailed = runGate({ docker: "failure", journeys: "success", test: "failure", skipTestGate: true });
  assert.equal(dockerFailed.status, 1);
  assert.equal(dockerFailed.deploy, false);

  const journeysFailed = runGate({ docker: "success", journeys: "failure", test: "success", skipTestGate: true });
  assert.equal(journeysFailed.status, 1);
  assert.equal(journeysFailed.deploy, false);
});

test("Pages releases wait for the Docker workflow's successful server job", () => {
  const server = workflow("fly-deploy.yml");
  const web = workflow("web-deploy.yml");
  assert.deepEqual(web.on.workflow_run.workflows, [server.name]);
  const gate = web.jobs.gate.steps.map((step) => step.run ?? "").join("\n");
  assert.ok(gate.includes('select(.name == "Deploy server")'));
  assert.ok(gate.includes('"${conclusion}" = "success"'));
  assert.ok(web.jobs.deploy.if.includes("needs.gate.outputs.deploy == 'true'"));
});

test("main's image builds on every push, and the release gate never waits on a runner", () => {
  const docker = workflow("docker.yml");
  assert.ok(docker.on.push.branches.includes("main"));
  const gate = workflow("fly-deploy.yml").jobs.gate.steps.map((step) => step.run ?? "").join("\n");
  assert.equal(/\bsleep\b/.test(gate), false);
});

test("the Flatpak bundle builds once a day, not on push", () => {
  const flatpak = workflow("flatpak-ci.yml");
  assert.ok(flatpak.on.schedule?.length === 1);
  assert.equal(flatpak.on.push, undefined);
});
