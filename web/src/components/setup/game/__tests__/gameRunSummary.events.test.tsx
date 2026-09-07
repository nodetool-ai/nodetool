/**
 * The landing checklist against the messages a real run emits (game-prd § 4.4).
 *
 * The unit suite next door feeds `summarizeGameRun` an already-assembled export
 * record, which cannot see where that record comes from. This one drives the
 * editor's own reducer with the frames the runner sends for a finished build —
 * one `output_update` per unconnected export handle, a completed `node_update`
 * per node, a completed `job_update` — and then reads the checklist off the
 * stores those frames wrote.
 *
 * That is the difference the reviewer's F2 turned on: `output_update` carries a
 * handle name the reducer drops, and the export node's handles land under its
 * node id as an appended array (its `output` handle is not even sent — it feeds
 * the `project` Output node). Read that and every row is blank on a successful
 * export. The completed generation keeps the whole record keyed by handle, so
 * the rows fill in.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  readGameSetup,
  writeGameSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { stub } from "../../../../test-utils/doubles";
import useResultsStore from "../../../../stores/ResultsStore";
import useErrorStore from "../../../../stores/ErrorStore";
import useWorkflowRunsStore from "../../../../stores/WorkflowRunsStore";
import { handleUpdate, type MsgpackData } from "../../../../stores/workflowUpdates";
import type {
  JobUpdate,
  NodeUpdate,
  OutputUpdate,
  WorkflowAttributes
} from "../../../../stores/ApiTypes";
import { useGameRunSummary } from "../gameRunSummary";
import { readGameBuild } from "../gameExtras";

const WORKFLOW_ID = "wf-game";
const JOB_ID = "job-export-1";

const listJobs = jest.fn();
jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    jobs: { list: { query: (...args: unknown[]) => listJobs(...args) } },
    assets: { list: { query: jest.fn().mockResolvedValue({ assets: [] }) } }
  }
}));

const renderSummary = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return renderHook(() => useGameRunSummary(WORKFLOW_ID), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  });
};

/** The graph `gameGraphPlacement` builds, as the node store holds it. */
const NODES = [
  {
    id: "gen_player",
    type: "nodetool.image.TextToImage",
    data: { setupStepId: "player" }
  },
  {
    id: "check_player",
    type: "nodetool.game.SpriteSheet",
    data: { setupStepId: "player" }
  },
  {
    id: "export",
    type: "nodetool.game.ExportGodotProject",
    data: {}
  },
  {
    id: "output_project",
    type: "nodetool.output.Output",
    data: {}
  }
];

/** The workflow the tab holds, with whatever `settings.game` this test seeded. */
let settings: Record<string, unknown> = {};
const workflowRow = () => ({ id: WORKFLOW_ID, name: "Ember Run", settings });
const managerState = {
  getWorkflow: workflowRow,
  getNodeStore: () => ({
    getState: () => ({ nodes: NODES, getWorkflow: workflowRow })
  }),
  updateWorkflow: (next: { settings: Record<string, unknown> }) => {
    settings = next.settings;
  },
  saveWorkflow: jest.fn(async () => {})
};
jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

const workflow = stub<WorkflowAttributes>({
  id: WORKFLOW_ID,
  name: "Ember Run"
});

const runnerStore = {
  getState: () => ({
    job_id: JOB_ID,
    state: "running",
    jobReplayCursor: 0,
    addNotification: jest.fn(),
    dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};

const emit = (message: MsgpackData) =>
  handleUpdate(workflow, message, runnerStore as never, () => undefined);

/** What the export node produced, keyed by the handle each value came out of. */
const EXPORT_OUTPUTS = {
  output: {
    directory: "games/ember-run",
    verified: true,
    archive: "games/ember-run.zip"
  },
  directory: "games/ember-run",
  files: ["project.godot", "scenes/main.tscn"],
  verified: true,
  verification: { ok: true, reason: null },
  errors: [],
  archive: "games/ember-run.zip"
};

/**
 * The frames a finished export sends, in the runner's own order: every
 * unconnected handle as its own `output_update` (the `output` handle is
 * suppressed — it travels the edge into the `project` Output node), then the
 * node's completion, then the job's.
 */
const emitCompletedExport = () => {
  emit(
    stub<NodeUpdate>({
      type: "node_update",
      node_id: "check_player",
      node_name: "SpriteSheet",
      node_type: "nodetool.game.SpriteSheet",
      status: "completed",
      result: { output: { type: "image", uri: "a.png" }, fill: { slot: "player" } },
      job_id: JOB_ID
    })
  );
  for (const [handle, value] of Object.entries(EXPORT_OUTPUTS)) {
    if (handle === "output") continue;
    emit(
      stub<OutputUpdate>({
        type: "output_update",
        node_id: "export",
        node_name: "Export Godot Project",
        output_name: handle,
        value,
        output_type: "any",
        metadata: {},
        disposition: "append",
        job_id: JOB_ID
      } as unknown as OutputUpdate)
    );
  }
  emit(
    stub<NodeUpdate>({
      type: "node_update",
      node_id: "export",
      node_name: "Export Godot Project",
      node_type: "nodetool.game.ExportGodotProject",
      status: "completed",
      result: EXPORT_OUTPUTS,
      job_id: JOB_ID
    })
  );
  emit(
    stub<JobUpdate>({ type: "job_update", status: "completed", job_id: JOB_ID })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  listJobs.mockResolvedValue({ jobs: [] });
  settings = {};
  useResultsStore.setState({
    outputResults: {},
    liveGenerations: {}
  } as never);
  useErrorStore.setState({ errors: {} } as never);
  useWorkflowRunsStore.setState({
    focusedJob: { [WORKFLOW_ID]: JOB_ID }
  } as never);
});

describe("the checklist against the run's own messages", () => {
  it("reports the directory, the archive and the verification the export sent", () => {
    emitCompletedExport();
    const { result } = renderSummary();
    expect(result.current).toMatchObject({
      checked: 1,
      total: 1,
      directory: "games/ember-run",
      archive: "games/ember-run.zip",
      verified: true,
      failures: []
    });
  });

  it("keeps the rows empty while the export has not completed", () => {
    for (const [handle, value] of Object.entries(EXPORT_OUTPUTS)) {
      if (handle === "output") continue;
      emit(
        stub<OutputUpdate>({
          type: "output_update",
          node_id: "export",
          node_name: "Export Godot Project",
          output_name: handle,
          value,
          output_type: "any",
          metadata: {},
          disposition: "append",
          job_id: JOB_ID
        } as unknown as OutputUpdate)
      );
    }
    const { result } = renderSummary();
    expect(result.current).toMatchObject({
      directory: null,
      archive: null,
      verified: false
    });
  });

  it("carries the reason a skipped verification gave", () => {
    emit(
      stub<NodeUpdate>({
        type: "node_update",
        node_id: "export",
        node_name: "Export Godot Project",
        node_type: "nodetool.game.ExportGodotProject",
        status: "completed",
        result: {
          ...EXPORT_OUTPUTS,
          verified: false,
          verification: { reason: "No Godot binary on this server" }
        },
        job_id: JOB_ID
      })
    );
    const { result } = renderSummary();
    expect(result.current.verified).toBe(false);
    expect(result.current.verificationReason).toBe(
      "No Godot binary on this server"
    );
  });

  // The generator, the resize and the checker all carry the slot's
  // `setupStepId`. A picture that came back is not a picture that passed the
  // template's cell grid, so only the checker moves this row.
  it("does not count a slot whose generator finished but whose checker has not", () => {
    emit(
      stub<NodeUpdate>({
        type: "node_update",
        node_id: "gen_player",
        node_name: "TextToImage",
        node_type: "nodetool.image.TextToImage",
        status: "completed",
        result: { output: { type: "image", uri: "a.png" } },
        job_id: JOB_ID
      })
    );
    const { result } = renderSummary();
    expect(result.current).toMatchObject({ checked: 0, total: 1 });
  });

  it("does not count a slot whose checker refused the asset", () => {
    emit(
      stub<NodeUpdate>({
        type: "node_update",
        node_id: "gen_player",
        node_name: "TextToImage",
        node_type: "nodetool.image.TextToImage",
        status: "completed",
        result: { output: { type: "image", uri: "a.png" } },
        job_id: JOB_ID
      })
    );
    emit(
      stub<NodeUpdate>({
        type: "node_update",
        node_id: "check_player",
        node_name: "SpriteSheet",
        node_type: "nodetool.game.SpriteSheet",
        status: "error",
        error: "the sheet is 3 cells wide, the slot needs 4",
        job_id: JOB_ID
      })
    );
    const { result } = renderSummary();
    expect(result.current.checked).toBe(0);
    expect(result.current.failures).toEqual([
      {
        nodeId: "check_player",
        slotId: "player",
        error: "the sheet is 3 cells wide, the slot needs 4"
      }
    ]);
  });

  it("names a node that failed by the slot it was filling", () => {
    emit(
      stub<NodeUpdate>({
        type: "node_update",
        node_id: "gen_player",
        node_name: "TextToImage",
        node_type: "nodetool.image.TextToImage",
        status: "error",
        error: "the provider refused",
        job_id: JOB_ID
      })
    );
    const { result } = renderSummary();
    expect(result.current.failures).toEqual([
      {
        nodeId: "gen_player",
        slotId: "player",
        error: "the provider refused"
      }
    ]);
  });

  it("restores a completed export after the panel was unmounted", async () => {
    settings = writeGameSetup({}, {
      stage: "done",
      build: {
        node_count: NODES.length,
        issues: [],
        validation_errors: [],
        run_started: true,
        run_error: null
      }
    });
    const mounted = renderSummary();
    mounted.unmount();
    expect(readGameBuild(readGameSetup(settings))?.export).toBeUndefined();

    useResultsStore.setState({ outputResults: {}, liveGenerations: {} } as never);
    useErrorStore.setState({ errors: {} } as never);
    useWorkflowRunsStore.setState({ focusedJob: {} } as never);
    listJobs.mockResolvedValue({
      jobs: [
        {
          id: JOB_ID,
          status: "completed",
          workflow_id: WORKFLOW_ID,
          outputs: { project: [EXPORT_OUTPUTS.output] }
        }
      ]
    });

    const reopened = renderSummary();

    await waitFor(() =>
      expect(readGameBuild(readGameSetup(settings))?.export).toMatchObject({
        job_id: JOB_ID,
        directory: "games/ember-run",
        archive: "games/ember-run.zip",
        verified: true
      })
    );
    reopened.rerender();
    expect(reopened.result.current).toMatchObject({
      checked: 1,
      total: 1,
      directory: "games/ember-run",
      archive: "games/ember-run.zip",
      verified: true
    });
    expect(listJobs).toHaveBeenCalledWith({
      workflow_id: WORKFLOW_ID,
      limit: 20,
      include_outputs: true
    });
  });
});
