import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";
import "@testing-library/jest-dom";

import CodeGenPreviewPanel from "../CodeGenPreviewPanel";
import mockTheme from "../../../../__mocks__/themeMock";
import { runInlineGraphJob } from "../../../../lib/workflow/runInlineGraphJob";
import { PREVIEW_NODE_ID } from "../codeGenPreviewRun";
import type { SampleEntry } from "../codeGenSamples";

jest.mock("../../../../lib/workflow/runInlineGraphJob", () => ({
  runInlineGraphJob: jest.fn()
}));

type SubscribeHandler = (message: Record<string, unknown>) => void;
const mockSubscribe = jest.fn(
  (_key: string, _handler: SubscribeHandler): (() => void) => jest.fn()
);
jest.mock("../../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: (key: string, handler: SubscribeHandler) =>
      mockSubscribe(key, handler)
  }
}));

const mockRun = runInlineGraphJob as unknown as jest.Mock;

const listType: codeGen.CodeGenTypeMetadata = { type: "list", type_args: [] };
const strType: codeGen.CodeGenTypeMetadata = { type: "str", type_args: [] };

const submission: codeGen.CodeGenSubmission = {
  title: "Merge rows",
  summary: "Joins two lists.",
  code: "return { merged: [], label: 'x' };",
  inputs: [{ name: "rows", type: listType }],
  outputs: [
    { name: "merged", type: listType },
    { name: "label", type: strType }
  ]
};

const entries: SampleEntry[] = [
  {
    name: "rows",
    type: { type: "list", optional: false, values: null, type_args: [], type_name: null },
    value: [1, 2],
    source: "latest_run"
  }
];

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CodeGenPreviewPanel
        submission={submission}
        entries={entries}
        onSampleChange={jest.fn()}
        onSampleRevert={jest.fn()}
      />
    </ThemeProvider>
  );

describe("CodeGenPreviewPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(jest.fn());
  });

  it("runs the submission locally and renders each named output", async () => {
    const user = userEvent.setup();
    mockRun.mockResolvedValue({
      success: true,
      outputs: { [PREVIEW_NODE_ID]: { merged: [1, 2], label: "done" } }
    });

    renderPanel();
    await user.click(screen.getByRole("button", { name: /run preview/i }));

    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Preview status" })).toHaveTextContent(
        /preview finished in/i
      )
    );

    expect(screen.getByText("merged")).toBeInTheDocument();
    expect(screen.getByText("label")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();

    const graph = mockRun.mock.calls[0][0].graph;
    expect(graph.nodes[0].dynamic_properties).toEqual({ rows: [1, 2] });
  });

  it("labels the sample value's source", () => {
    renderPanel();
    expect(screen.getByText("from latest run")).toBeInTheDocument();
  });

  it("warns when an output does not match its declared type", async () => {
    const user = userEvent.setup();
    mockRun.mockResolvedValue({
      success: true,
      outputs: { [PREVIEW_NODE_ID]: { merged: "oops", label: "done" } }
    });

    renderPanel();
    await user.click(screen.getByRole("button", { name: /run preview/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/declared list but the run produced a string/i)
      ).toBeInTheDocument()
    );
  });

  it("surfaces a failed run's error", async () => {
    const user = userEvent.setup();
    mockRun.mockResolvedValue({
      success: false,
      outputs: {},
      error: "ReferenceError: rows is not defined"
    });

    renderPanel();
    await user.click(screen.getByRole("button", { name: /run preview/i }));

    await waitFor(() =>
      expect(
        screen.getAllByText(/ReferenceError: rows is not defined/).length
      ).toBeGreaterThan(0)
    );
  });

  it("shows the logs the run emitted", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockImplementation((_key, handler) => {
      handler({ type: "log_update", content: "row count 2" });
      return jest.fn();
    });
    mockRun.mockResolvedValue({
      success: true,
      outputs: { [PREVIEW_NODE_ID]: { merged: [], label: "" } }
    });

    renderPanel();
    await user.click(screen.getByRole("button", { name: /run preview/i }));

    await waitFor(() =>
      expect(screen.getByLabelText("Preview logs")).toHaveTextContent(
        "row count 2"
      )
    );
  });

  it("discards a stale run that settles after a newer one", async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockRun
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        success: true,
        outputs: { [PREVIEW_NODE_ID]: { merged: [9], label: "newer" } }
      });

    renderPanel();
    await user.click(screen.getByRole("button", { name: /run preview/i }));
    await user.click(screen.getByRole("button", { name: /run preview/i }));

    await waitFor(() =>
      expect(screen.getByText("newer")).toBeInTheDocument()
    );

    resolveFirst({
      success: true,
      outputs: { [PREVIEW_NODE_ID]: { merged: [1], label: "stale" } }
    });
    await first;

    await waitFor(() => expect(screen.getByText("newer")).toBeInTheDocument());
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });
});
