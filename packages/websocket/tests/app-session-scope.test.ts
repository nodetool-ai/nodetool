/**
 * A deployed app's visitor reaches the runner as the app's owner, so these
 * tests pin what the connection is *not* allowed to do with that identity.
 */
import { describe, expect, it } from "vitest";

import {
  APP_SESSION_COMMANDS,
  confineRunRequest,
  isAppSessionCommandAllowed,
  isRunRefusal,
  type RunnableRelease
} from "../src/lib/app-session-scope.js";

const SCOPE = { applicationId: "app-1", version: 2 };

const release: RunnableRelease = {
  version: 3,
  workflows: [
    {
      workflowId: "wf-published",
      graph: {
        nodes: [{ id: "n1", type: "nodetool.text.Concat" }],
        edges: []
      }
    },
    { workflowId: "wf-unpinned", graph: null }
  ]
};

describe("isAppSessionCommandAllowed", () => {
  it("allows starting, feeding, stopping and reading a run", () => {
    for (const command of [
      "run_job",
      "reconnect_job",
      "cancel_job",
      "stream_input",
      "end_input_stream",
      "get_status"
    ]) {
      expect(isAppSessionCommandAllowed(command)).toBe(true);
    }
  });

  it("refuses everything that reads or spends the owner's account", () => {
    for (const command of [
      "chat_message",
      "resume_chat",
      "list_chat_turns",
      "inference",
      "generate_text",
      "generate_media",
      "transcribe_audio",
      "list_workflows",
      "get_workflow",
      "list_assets",
      "get_asset",
      "list_nodes",
      "get_node",
      "update_node_properties",
      "set_permission_mode",
      "set_mode",
      "clear_models",
      "stop"
    ]) {
      expect(isAppSessionCommandAllowed(command)).toBe(false);
    }
  });

  it("refuses a command nobody has classified", () => {
    expect(isAppSessionCommandAllowed("some_command_added_later")).toBe(false);
    expect(APP_SESSION_COMMANDS.size).toBe(6);
  });
});

describe("confineRunRequest", () => {
  it("substitutes the release's graph for whatever the client sent", () => {
    const result = confineRunRequest(
      {
        workflow_id: "wf-published",
        graph: {
          nodes: [{ id: "evil", type: "nodetool.code.Code" }],
          edges: []
        }
      },
      SCOPE,
      release
    );

    expect(isRunRefusal(result)).toBe(false);
    if (isRunRefusal(result)) return;
    expect(result.graph?.nodes).toEqual([
      { id: "n1", type: "nodetool.text.Concat" }
    ]);
  });

  it("takes the app from the session and the version from the release", () => {
    const result = confineRunRequest(
      {
        workflow_id: "wf-published",
        application_id: "somebody-elses-app",
        application_version: 99
      },
      SCOPE,
      release
    );

    if (isRunRefusal(result)) throw new Error("expected a confined run");
    expect(result.application_id).toBe("app-1");
    expect(result.application_version).toBe(3);
  });

  it("drops every field a visitor has no business setting", () => {
    const result = confineRunRequest(
      {
        workflow_id: "wf-published",
        user_id: "someone-else",
        auth_token: "ntk_stolen",
        supervise: true,
        supervisor: { model: "anthropic/claude-sonnet-5" },
        concurrent: true,
        execution_options: { persistence: "session" },
        settings: { NODETOOL_ANYTHING: "1" }
      },
      SCOPE,
      release
    );

    if (isRunRefusal(result)) throw new Error("expected a confined run");
    expect(result.user_id).toBeUndefined();
    expect(result.auth_token).toBeUndefined();
    expect(result.supervise).toBeUndefined();
    expect(result.supervisor).toBeUndefined();
    expect(result.concurrent).toBeUndefined();
    expect(result.execution_options).toBeUndefined();
    expect(result.settings).toBeUndefined();
  });

  it("keeps what using an app actually means", () => {
    const result = confineRunRequest(
      {
        workflow_id: "wf-published",
        job_id: "job-7",
        job_name: "Draft a note",
        params: { prompt: "hello" },
        operation_id: "draft"
      },
      SCOPE,
      release
    );

    if (isRunRefusal(result)) throw new Error("expected a confined run");
    expect(result).toMatchObject({
      job_id: "job-7",
      job_name: "Draft a note",
      params: { prompt: "hello" },
      operation_id: "draft"
    });
  });

  it("refuses a workflow the release does not publish", () => {
    const result = confineRunRequest(
      { workflow_id: "wf-the-owners-private-one" },
      SCOPE,
      release
    );
    expect(result).toEqual({
      refused: "This app does not publish that workflow"
    });
  });

  it("refuses a workflow the release pinned no graph for", () => {
    const result = confineRunRequest(
      { workflow_id: "wf-unpinned" },
      SCOPE,
      release
    );
    // Falling back to the live workflow here would run the owner's editable
    // graph, which nobody published.
    expect(result).toEqual({
      refused: "This app does not publish that workflow"
    });
  });

  it("refuses a run that names no workflow", () => {
    expect(confineRunRequest({}, SCOPE, release)).toEqual({
      refused: "This app run did not name a workflow"
    });
  });
});
