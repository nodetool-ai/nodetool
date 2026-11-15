import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const workflow = yaml.load(
  readFileSync(new URL("../../.github/workflows/native-graph-runner.yml", import.meta.url), "utf8"),
);
const build = workflow.jobs.build;
const select = build.steps.find((step) => step.id === "select");

describe("native graph runner workflow", () => {
  it("selects affected tests on pull requests and pushes, diffing a push against its before commit", () => {
    expect(select).toBeDefined();
    expect(select.if).toBe("github.event_name == 'pull_request' || github.event_name == 'push'");
    expect(select["continue-on-error"]).toBe(true);
    expect(select.env.PUSH_BEFORE).toBe("${{ github.event.before }}");
    expect(select.run).toContain('base="$PUSH_BEFORE"');
    expect(select.run).toContain('--base "$base"');
    const test = build.steps.find((step) => step.name === "Test");
    expect(test.if).toBe("steps.select.outputs.run != 'false'");
  });

  it("runs every test nightly, only when main changed a watched path", () => {
    expect(workflow.on.schedule).toHaveLength(1);
    const watched = workflow.jobs.changes.steps[0].env.WATCHED_PATHS.split(/\s+/).filter(Boolean);
    const pushPaths = workflow.on.push.paths.map((path) => path.replace(/\/\*\*$/, ""));
    expect(watched).toEqual(pushPaths);
    expect(build.needs).toContain("changes");
    expect(build.if).toBe("needs.changes.outputs.run == 'true'");
    expect(workflow.jobs["ci-image"].if).toBe("needs.changes.outputs.run == 'true'");
  });

  it("keeps the event in the concurrency group so push and nightly runs never replace each other", () => {
    expect(workflow.concurrency.group).toContain("${{ github.event_name }}");
  });
});
