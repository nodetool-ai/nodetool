import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { unzipSync, strFromU8 } from "fflate";
import mockTheme from "../../../__mocks__/themeMock";
import BugReportDialog from "../BugReportDialog";
import type { BugReportContext } from "../../../utils/bugReportBundle";
import {
  recordConsoleEntry,
  clearConsoleEntries
} from "../../../utils/consoleCapture";
import {
  recordProviderCallFailure,
  useProviderCallFailureStore
} from "../../../stores/ProviderCallFailureStore";

const workflow = {
  id: "wf-1",
  name: "My workflow",
  graph: { nodes: [{ id: "n1", properties: { api_key: "hunter2" } }], edges: [] }
};

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector({ getCurrentWorkflow: () => workflow })
}));

jest.mock("../../../stores/LogStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) => selector({ logs: [] })
}));

const addNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification })
}));

/** The blob handed to the download anchor, captured from createObjectURL. */
let downloaded: Blob | null = null;

async function bundleEntries(blob: Blob): Promise<Record<string, string>> {
  // jsdom's Blob has no arrayBuffer(), and there is no global Response here.
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const bytes = new Uint8Array(buffer);
  const unzipped = unzipSync(bytes);
  return Object.fromEntries(
    Object.entries(unzipped).map(([name, content]) => [name, strFromU8(content)])
  );
}

const renderDialog = (context: BugReportContext, onClose = jest.fn()) =>
  render(
    // Mounted as a sibling of <RouterProvider>, so it must not need a Router.
    <ThemeProvider theme={mockTheme}>
      <BugReportDialog context={context} onClose={onClose} />
    </ThemeProvider>
  );

describe("BugReportDialog", () => {
  beforeEach(() => {
    downloaded = null;
    addNotification.mockClear();
    clearConsoleEntries();
    useProviderCallFailureStore.getState().clear();
    window.URL.createObjectURL = jest.fn((blob: Blob) => {
      downloaded = blob;
      return "blob:mock";
    });
    window.URL.revokeObjectURL = jest.fn();
    window.open = jest.fn();
  });

  it("cannot submit until the reporter describes the problem", async () => {
    renderDialog({ source: "manual" });
    expect(screen.getByRole("button", { name: /save report bundle/i })).toBeDisabled();
  });

  it("builds a zip holding the report and the checked sections", async () => {
    const user = userEvent.setup();
    recordConsoleEntry("error", ["something exploded"]);
    const onClose = jest.fn();

    renderDialog(
      {
        source: "node-error",
        errorText: "Resize failed",
        nodeType: "nodetool.image.Resize",
        nodeDetail: "Node type: nodetool.image.Resize",
        workflowId: "wf-1"
      },
      onClose
    );

    await user.type(
      screen.getByLabelText(/what went wrong/i),
      "Resize throws on PNG"
    );
    await user.click(screen.getByRole("button", { name: /save report bundle/i }));

    await waitFor(() => expect(downloaded).not.toBeNull());
    const entries = await bundleEntries(downloaded!);

    expect(Object.keys(entries).sort()).toEqual([
      "console.txt",
      "error.txt",
      "node.txt",
      "report.md",
      "system.txt",
      "workflow.json"
    ]);
    expect(entries["report.md"]).toContain("Resize throws on PNG");
    expect(entries["error.txt"]).toContain("Resize failed");
    expect(entries["console.txt"]).toContain("something exploded");
    // The graph travels with the report; the key inside it does not.
    expect(entries["workflow.json"]).toContain("My workflow");
    expect(entries["workflow.json"]).not.toContain("hunter2");
  });

  it("attaches the failed provider call the run made", async () => {
    const user = userEvent.setup();
    recordProviderCallFailure({
      type: "provider_call_failed",
      provider: "openai",
      model: "gpt-5.4-mini",
      operation: "generateMessages",
      kind: "rate_limit",
      status: 429,
      message: "429 Too Many Requests",
      request_id: "req_abc123",
      duration_ms: 812,
      request_source: "wire",
      request: { api_key: "sk-live-abcdefghijklmnopqr", prompt: "a red fox" },
      workflow_id: "wf-1",
      timestamp: "2026-01-02T03:04:05.000Z"
    });

    renderDialog({
      source: "node-error",
      errorText: "Agent failed",
      nodeType: "nodetool.agents.Agent",
      workflowId: "wf-1"
    });

    await user.type(screen.getByLabelText(/what went wrong/i), "the agent 429s");
    await user.click(screen.getByRole("button", { name: /save report bundle/i }));

    await waitFor(() => expect(downloaded).not.toBeNull());
    const entries = await bundleEntries(downloaded!);

    const call = entries["provider-call.txt"];
    expect(call).toContain("Provider: openai");
    expect(call).toContain("Model: gpt-5.4-mini");
    expect(call).toContain("HTTP status: 429");
    expect(call).toContain("Provider request id: req_abc123");
    expect(call).toContain("a red fox");
    expect(call).not.toContain("sk-live-abcdefghijklmnopqr");
  });

  it("attaches no provider call when the failure belongs to another run", async () => {
    const user = userEvent.setup();
    recordProviderCallFailure({
      type: "provider_call_failed",
      provider: "openai",
      operation: "generateMessages",
      kind: "server",
      message: "500",
      workflow_id: "wf-other",
      timestamp: "2026-01-02T03:04:05.000Z"
    });

    renderDialog({ source: "node-error", errorText: "boom", workflowId: "wf-1" });
    await user.type(screen.getByLabelText(/what went wrong/i), "unrelated");
    await user.click(screen.getByRole("button", { name: /save report bundle/i }));

    await waitFor(() => expect(downloaded).not.toBeNull());
    const entries = await bundleEntries(downloaded!);
    expect(Object.keys(entries)).not.toContain("provider-call.txt");
  });

  it("leaves out a section the reporter unchecks", async () => {
    const user = userEvent.setup();
    renderDialog({ source: "manual" });

    await user.type(screen.getByLabelText(/what went wrong/i), "no graph please");
    await user.click(screen.getByRole("checkbox", { name: /workflow graph/i }));
    await user.click(screen.getByRole("button", { name: /save report bundle/i }));

    await waitFor(() => expect(downloaded).not.toBeNull());
    const entries = await bundleEntries(downloaded!);
    expect(Object.keys(entries)).not.toContain("workflow.json");
  });

  it("saves the zip before it offers to open the issue", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderDialog({ source: "manual" }, onClose);

    await user.type(screen.getByLabelText(/what went wrong/i), "it broke");
    await user.click(screen.getByRole("button", { name: /save report bundle/i }));

    // Step 1 saved the file and opened nothing; the dialog stays up.
    await waitFor(() => expect(downloaded).not.toBeNull());
    expect(window.open).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/nodetool-bug-manual-/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open github issue/i }));
    expect(onClose).toHaveBeenCalled();

    const opened = new URL(
      (window.open as jest.Mock).mock.calls[0][0] as string
    );
    expect(opened.origin + opened.pathname).toBe(
      "https://github.com/nodetool-ai/nodetool/issues/new"
    );
    expect(opened.searchParams.get("title")).toBe("[Bug]: it broke");
    expect(opened.searchParams.get("labels")).toBe("bug");
    expect(opened.searchParams.get("body")).toContain("nodetool-bug-manual-");
  });

  it("shows the file content before it is attached", async () => {
    const user = userEvent.setup();
    renderDialog({ source: "manual" });

    expect(screen.queryByText(/My workflow/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /view workflow graph/i }));
    expect(screen.getByText(/My workflow/)).toBeInTheDocument();
  });
});
