/**
 * `createRunSupervisor` — the server-side supervisor factory.
 *
 * Supervision is opt-in and fails closed: no flag, no unresolvable model, and
 * no unavailable provider may produce a handle, because a run without one
 * behaves exactly as it does today.
 */
import { describe, it, expect, afterEach } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createRunSupervisor } from "../src/run-supervisor.js";

function context(): ProcessingContext {
  return new ProcessingContext({ jobId: "j1", workflowId: null, userId: "1" });
}

const ENV_KEYS = [
  "NODETOOL_SUPERVISOR_PROVIDER",
  "NODETOOL_SUPERVISOR_MODEL"
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("createRunSupervisor", () => {
  it("returns null without an explicit supervise flag", async () => {
    expect(
      await createRunSupervisor({
        context: context(),
        defaultProvider: "openai",
        defaultModel: "gpt-4o-mini"
      })
    ).toBeNull();
    expect(
      await createRunSupervisor({
        supervise: false,
        context: context(),
        defaultProvider: "openai",
        defaultModel: "gpt-4o-mini"
      })
    ).toBeNull();
  });

  it("returns null when no supervisor model is configured", async () => {
    expect(
      await createRunSupervisor({ supervise: true, context: context() })
    ).toBeNull();
  });

  it("returns null when the provider cannot be built (unknown id, missing key)", async () => {
    expect(
      await createRunSupervisor({
        supervise: true,
        supervisor: { provider: "not_a_registered_provider", model: "x" },
        context: context()
      })
    ).toBeNull();
  });

  it("builds a handle from the request's provider and model", async () => {
    // A provider that needs no API key, so the test asserts on the wiring
    // rather than on a configured secret store.
    const handle = await createRunSupervisor({
      supervise: true,
      supervisor: { provider: "claude_agent_sdk", model: "sonnet" },
      context: context()
    });
    expect(handle).not.toBeNull();
    handle?.close();
  });

  it("falls back to the environment when nothing else names a model", async () => {
    process.env["NODETOOL_SUPERVISOR_PROVIDER"] = "claude_agent_sdk";
    process.env["NODETOOL_SUPERVISOR_MODEL"] = "sonnet";
    const handle = await createRunSupervisor({
      supervise: true,
      context: context()
    });
    expect(handle).not.toBeNull();
    handle?.close();
  });
});
