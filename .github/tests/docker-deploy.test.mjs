import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
