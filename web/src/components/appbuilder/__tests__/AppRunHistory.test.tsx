import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import {
  getRunResultSchema,
  getRunLogsResultSchema,
  type GetRunResult
} from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";
import useChatDraftStore from "../../../stores/ChatDraftStore";
import { restFetch } from "../../../lib/rest-fetch";
import AppRunHistory from "../AppRunHistory";

const runA = "a".repeat(32);
const runB = "b".repeat(32);
const instanceId = "c".repeat(32);
const failedSpan = "d".repeat(16);
let expired = false;
const contentRequests = jest.fn();
const activityRequests = jest.fn();
const listRequests = jest.fn();
const openInspection = jest.fn();
const openTab = jest.fn();
const createThread = jest.fn();
const runtimeMounted = jest.fn();

function record(id: string): GetRunResult["run"] {
  return {
    id,
    user_id: "owner",
    kind: "app",
    source_id: instanceId,
    parent_run_id: null,
    trace_id: "e".repeat(32),
    root_span_id: failedSpan,
    origin: "ui",
    status: id === runB ? "running" : "failed",
    started_at: "2026-10-05T10:00:00.000Z",
    ended_at: id === runB ? null : "2026-10-05T10:01:00.000Z",
    cost_usd: 0,
    error: null,
    content_expired: 0,
    truncated: 0,
    incomplete: 0,
    parents: [],
    parents_limited: false,
    app: {
      instance_id: instanceId,
      application_id: "f".repeat(32),
      operation_id: "generate",
      app_version: 1,
      actual_usd: 0,
      cost_state: "settled",
      inputs: {
        prompt: id === runA ? "Historical input A" : "Working input B"
      },
      outputs: {
        result: id === runA ? "Historical output A" : "Working output B"
      }
    }
  };
}
function detail(id: string) {
  return getRunResultSchema.parse({
    run: record(id),
    summary: {
      content_state: expired ? "expired" : "available",
      content_expired: expired,
      truncated: false,
      incomplete: false,
      first_failed_span_id: failedSpan,
      failure_path: [],
      cost_by_provider: {},
      slowest_spans: [],
      counts_by_name: {},
      span_count: 1,
      event_count: 1,
      generation_ids: [],
      document_ids: ["document-a"],
      documents: [{ kind: "storyboard", id: "document-a" }],
      documents_limited: false,
      summary_truncated: false
    }
  });
}
function logs(id: string) {
  return getRunLogsResultSchema.parse({
    run: record(id),
    content_state: expired ? "expired" : "available",
    content_expired: expired,
    truncated: false,
    incomplete: false,
    next_cursor: null,
    limited: false,
    logs: [
      {
        id: "event-a",
        span_id: failedSpan,
        span_name: "agent.loop",
        time_ms: 1,
        name: "agent.activity",
        source: "agent",
        level: "info",
        attributes: {
          "log.message":
            id === runA ? "Recorded agent work A" : "Live agent work B"
        }
      }
    ]
  });
}

jest.mock("../../../serverState/useRuns", () => ({
  useRuns: (options: unknown) => {
    listRequests(options);
    return {
      data: {
        pages: [{ runs: [record(runB), record(runA)], next_cursor: null }]
      },
      isLoading: false,
      error: null,
      hasNextPage: false
    };
  },
  useRunContent: (id: string | null) => {
    contentRequests(id);
    return { data: id ? detail(id) : undefined, isLoading: false, error: null };
  },
  useRunLogs: (id: string, options: unknown) => {
    activityRequests(id, options);
    return {
      data: { pages: [logs(id)] },
      isLoading: false,
      error: null,
      hasNextPage: false
    };
  },
  useRunLiveUpdates: jest.fn()
}));
jest.mock("../../../hooks/useRunInspection", () => ({
  useRunInspection: () => ({ openRunInspection: openInspection })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "project-a",
  useWorkspaceTabsStore: Object.assign(
    <T,>(select: (state: { openForegroundTab: jest.Mock }) => T) =>
      select({ openForegroundTab: openTab }),
    { getState: () => ({ tabs: [], activeTabId: null }) }
  )
}));
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(select: (state: { createNewThread: jest.Mock }) => T) =>
    select({ createNewThread: createThread })
}));
jest.mock("../../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
jest.mock("../AppRuntimeView", () => ({
  __esModule: true,
  default: () => {
    runtimeMounted();
    return <div>Executable runtime</div>;
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
  expired = false;
  createThread.mockResolvedValue("inspect-thread");
  useChatDraftStore.setState({ drafts: {}, runReferences: {} });
});

function mount(selectedRunId: string | null, onSelect = jest.fn()) {
  return render(
    <ThemeProvider theme={mockTheme}>
      <AppRunHistory
        instanceId={instanceId}
        selectedRunId={selectedRunId}
        onSelect={onSelect}
      />
    </ThemeProvider>
  );
}

it("inspects selected run A while B is running without writing or executing the working instance", async () => {
  const select = jest.fn();
  mount(runA, select);
  const inspector = within(
    screen.getByRole("region", { name: "Historical run" })
  );
  expect(
    inspector.getByText("Historical result (read-only)")
  ).toBeInTheDocument();
  expect(inspector.getByText("Historical input A")).toBeInTheDocument();
  expect(inspector.getByText("Historical output A")).toBeInTheDocument();
  expect(inspector.getByText("Recorded agent work A")).toBeInTheDocument();
  expect(inspector.queryByText("Working output B")).not.toBeInTheDocument();
  expect(inspector.queryByText("Live agent work B")).not.toBeInTheDocument();
  expect(contentRequests).toHaveBeenCalledWith(runA);
  expect(activityRequests).toHaveBeenCalledWith(
    runA,
    expect.objectContaining({ source: "agent", include_content: true })
  );
  expect(listRequests).toHaveBeenCalledWith({
    kind: "app",
    instance_id: instanceId,
    limit: 20
  });
  await userEvent.click(inspector.getByRole("button", { name: "View trace" }));
  expect(openInspection).toHaveBeenCalledWith({
    runId: runA,
    spanId: failedSpan
  });
  await userEvent.click(
    inspector.getByRole("button", { name: "Ask the agent" })
  );
  await waitFor(() =>
    expect(openTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chat", ref: "inspect-thread" })
    )
  );
  expect(useChatDraftStore.getState().runReferences["inspect-thread"]).toEqual({
    run_id: runA,
    span_id: failedSpan
  });
  expect(useChatDraftStore.getState().drafts["inspect-thread"]).not.toContain(
    "Recorded agent work A"
  );
  await userEvent.click(
    inspector.getByRole("button", { name: "Open current storyboard" })
  );
  expect(openTab).toHaveBeenCalledWith({
    type: "storyboard",
    ref: "document-a",
    mode: "view",
    projectId: "project-a"
  });
  expect(select).not.toHaveBeenCalled();
  expect(runtimeMounted).not.toHaveBeenCalled();
  expect(restFetch).not.toHaveBeenCalled();
  expect(inspector.queryByRole("textbox")).not.toBeInTheDocument();
});

it("changes inspection selection without restoring historical values into the working app", async () => {
  const select = jest.fn();
  mount(null, select);
  const older = screen.getByRole("button", { name: /generate · failed/ });
  await userEvent.click(older);
  expect(select).toHaveBeenCalledWith(runA);
  expect(contentRequests).toHaveBeenCalledWith(null);
  expect(runtimeMounted).not.toHaveBeenCalled();
  expect(restFetch).not.toHaveBeenCalled();
});

it("does not render expired outputs or activity even if a stale response still contains them", () => {
  expired = true;
  mount(runA);
  const inspector = within(
    screen.getByRole("region", { name: "Historical run" })
  );
  expect(inspector.getByText("Run content expired.")).toBeInTheDocument();
  expect(inspector.getByText("Activity content expired.")).toBeInTheDocument();
  expect(inspector.queryByText("Historical output A")).not.toBeInTheDocument();
  expect(inspector.queryByText("Historical input A")).not.toBeInTheDocument();
  expect(
    inspector.queryByText("Recorded agent work A")
  ).not.toBeInTheDocument();
  expect(runtimeMounted).not.toHaveBeenCalled();
  expect(restFetch).not.toHaveBeenCalled();
});
