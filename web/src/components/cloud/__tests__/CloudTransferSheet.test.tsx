import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { CloudTransferResult } from "../../../window";
import { TransferController } from "../../../lib/cloud/TransferController";
import CloudTransferSheet from "../CloudTransferSheet";

jest.mock("../../support/ErrorBanner", () => ({
  __esModule: true,
  default: ({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) => (
    <div role="alert">
      {children}
      <button type="button" onClick={onRetry}>
        retry
      </button>
    </div>
  )
}));

const id = (label: string): string => label.padEnd(32, "0");
const hash = (label: string): string => label.padEnd(64, "0");

type Answers = Record<string, unknown[]>;

const fakeRouter = (answers: Answers) => {
  const calls: { procedure: string; input: Record<string, unknown> }[] = [];
  const call = jest.fn(async (procedure: string, input: Record<string, unknown>): Promise<CloudTransferResult> => {
    calls.push({ procedure, input });
    const queue = answers[procedure];
    if (!queue || queue.length === 0) {
      return { status: "offline", reason: "", data: null };
    }
    return { status: "ok", reason: "", data: queue.length > 1 ? queue.shift() : queue[0] };
  });
  return { call, calls };
};

const capture = {
  status: "captured",
  transfer_id: id("e1"),
  first_publication: false,
  operations: [
    { op: "replace_document", kind: "workflow", document_id: id("c1"), base_hash: hash("b"), captured_hash: hash("a") }
  ],
  documents: [{ kind: "workflow", local_id: id("c1"), cloud_id: id("c1"), name: "Mine" }],
  file_operations: [],
  missing_files: [],
  missing_document_files: [],
  skipped: [],
  deleted_locally: [
    { kind: "workflow", local_id: id("d1"), cloud_id: id("d1"), base_hash: hash("d") }
  ]
};

const receive = {
  set_id: id("5e1"),
  documents: [
    {
      kind: "workflow",
      cloud_id: id("c2"),
      local_id: id("c2"),
      name: "Both",
      content_hash: hash("c2"),
      local_hash: null,
      status: "both_changed",
      changed_files: 0,
      decision: null,
      files: [],
      missing_files: []
    }
  ]
};

const finished = {
  status: "finished",
  set_id: id("5e1"),
  result: {
    received: [],
    changed_during_receive: [],
    not_received: [],
    kept_beside: [],
    missing_files: [],
    file_kept: []
  }
};

const renderSheet = (controller: TransferController, onClose = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CloudTransferSheet controller={controller} onClose={onClose} />
    </ThemeProvider>
  );

describe("CloudTransferSheet", () => {
  it("asks for each choice before it synchronizes", async () => {
    const router = fakeRouter({
      "cloudTransfer.link": [{ state: "linked", cloud_project_id: id("c9") }],
      "cloudTransfer.send.capture": [capture],
      "cloudTransfer.receive.capture": [receive],
      "cloudTransfer.receive.run": [finished],
      "cloudTransfer.send.run": [
        { status: "committed", transfer_id: id("e1"), result: { outcome: "committed", project_id: id("c9"), documents: [] } }
      ]
    });
    const controller = new TransferController({
      call: router.call,
      projectId: id("f1"),
      readLink: true,
      signedIn: () => true
    });
    renderSheet(controller);
    await act(() => controller.start());

    expect(screen.getByText("Both")).toBeInTheDocument();
    expect(screen.getByText("Mine")).toBeInTheDocument();
    expect(screen.getByText("Changed here, will be sent")).toBeInTheDocument();
    // A deletion is off by default and says that the cloud version comes back.
    expect(screen.getByRole("checkbox", { name: "Delete in the cloud too" })).not.toBeChecked();
    const apply = screen.getByRole("button", { name: "Synchronize" });
    expect(apply).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(apply).toBeEnabled();
    await userEvent.click(apply);
    await waitFor(() => expect(screen.getByText("Synchronized.")).toBeInTheDocument());
    expect(router.calls.map((item) => item.procedure)).toEqual([
      "cloudTransfer.link",
      "cloudTransfer.send.capture",
      "cloudTransfer.receive.capture",
      "cloudTransfer.receive.run",
      "cloudTransfer.send.run"
    ]);
    expect(router.calls[3].input.decisions).toEqual([
      { kind: "workflow", document_id: id("c2"), decision: "keep_local" }
    ]);
    // The unconfirmed deletion is not sent.
    expect(router.calls[4].input.confirm_deletes).toEqual([]);
  });

  it("lists new and changed files of the project folder (CF5)", async () => {
    const router = fakeRouter({
      "cloudTransfer.link": [{ state: "linked", cloud_project_id: id("c9") }],
      "cloudTransfer.send.capture": [
        {
          ...capture,
          operations: [],
          documents: [],
          deleted_locally: [],
          file_operations: [
            { op: "put_workspace_file", path: "notes/plan.md", hash: hash("a"), size: 4, base_hash: hash("b") },
            { op: "put_workspace_file", path: "data/new.csv", hash: hash("c"), size: 4, base_hash: null }
          ]
        }
      ],
      "cloudTransfer.receive.capture": [{ set_id: id("s1"), documents: [] }]
    });
    const controller = new TransferController({
      call: router.call,
      projectId: id("f1"),
      readLink: true,
      signedIn: () => true
    });
    renderSheet(controller);
    await act(() => controller.start());

    expect(screen.getByText("notes/plan.md")).toBeInTheDocument();
    expect(screen.getByText("Changed in the project folder, will be sent")).toBeInTheDocument();
    expect(screen.getByText("data/new.csv")).toBeInTheDocument();
    expect(screen.getByText("New in the project folder, will be sent")).toBeInTheDocument();
  });

  it("offers Collect for linked files and shows the sheet after it", async () => {
    const router = fakeRouter({
      "cloudTransfer.send.capture": [
        { status: "collect_first", external: ["clip.mov"], message: "Collect." },
        { ...capture, deleted_locally: [] }
      ]
    });
    const collect = jest.fn().mockResolvedValue({ copied: [], skipped: [], failed: [], interrupted: false });
    const controller = new TransferController({ call: router.call, projectId: id("f1"), signedIn: () => true, collect });
    renderSheet(controller);
    await act(() => controller.start());

    expect(
      screen.getByText(
        "Some files this project uses are outside the project folder. Collect copies them into its Imported folder, then reads the project again."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("clip.mov")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collect" }));
    await waitFor(() => expect(screen.getByText("Mine")).toBeInTheDocument());
    expect(collect).toHaveBeenCalledWith(id("f1"));
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  });

  it("shows a failure with a retry and ends the sheet on close", async () => {
    const router = fakeRouter({});
    const onClose = jest.fn();
    const controller = new TransferController({ call: router.call, projectId: id("f1"), signedIn: () => true });
    renderSheet(controller, onClose);
    await act(() => controller.start());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The cloud server could not be reached. Try again when you are online."
    );
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() => expect(router.call).toHaveBeenCalledTimes(2));
    // The title bar's close control and the footer button both close the sheet.
    await userEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(onClose).toHaveBeenCalled();
    expect(controller.snapshot.stage).toBe("idle");
  });
});
