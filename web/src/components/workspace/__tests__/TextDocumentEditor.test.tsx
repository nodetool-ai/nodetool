import { installGlobal, stub } from "../../../test-utils/doubles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset, DataframeRef } from "../../../stores/ApiTypes";

// Heavy editor deps that are not exercised by the CSV branch.
// A one-line editor holding "Heater broken", with the caret on that line.
const mockExecuteEdits = jest.fn();
const mockFakeEditor = {
  getModel: () => ({
    getValueLength: () => 13,
    getLineContent: () => "Heater broken",
    getLineMaxColumn: () => 14,
    getEOL: () => "\n",
    getValueInRange: () => "",
    getAlternativeVersionId: () => 1,
    getVersionId: () => 1
  }),
  getSelection: () => ({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1
  }),
  executeEdits: mockExecuteEdits,
  onDidChangeModelContent: jest.fn(),
  setPosition: jest.fn(),
  focus: jest.fn()
};
jest.mock("../MonacoPane", () => ({
  __esModule: true,
  default: ({
    onChange,
    onEditorMount
  }: {
    onChange: (value: string) => void;
    onEditorMount?: (editor: unknown) => void;
  }) => (
    <div data-testid="monaco">
      <button onClick={() => onChange("# Heater\n\nIt stopped working.")}>
        type draft
      </button>
      <button onClick={() => onEditorMount?.(mockFakeEditor)}>mount</button>
    </div>
  )
}));
jest.mock("../../textEditor/EditorToolbar", () => ({
  __esModule: true,
  default: ({ onHeading }: { onHeading?: () => void }) => (
    <div data-testid="editor-toolbar">
      {onHeading && <button onClick={onHeading}>Heading</button>}
    </div>
  )
}));

const mockUpdate = jest.fn();
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(selector: (s: { update: unknown }) => T) =>
    selector({ update: mockUpdate })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (s: { addNotification: unknown }) => T) =>
    selector({ addNotification: jest.fn() })
}));

// Stand-in for the real Tabulator-backed DataTable. It renders the row count it
// receives and an "add row" button that calls `onChange` exactly the way the
// real DataTable does: append one empty value per column.
jest.mock("../../node/DataTable/DataTable", () => ({
  __esModule: true,
  default: ({
    dataframe,
    onChange
  }: {
    dataframe: DataframeRef;
    onChange?: (df: DataframeRef) => void;
  }) => {
    const rows = dataframe.data ?? [];
    const addRow = () =>
      onChange?.({
        ...dataframe,
        data: [...rows, (dataframe.columns ?? []).map(() => "")]
      });
    return (
      <div>
        <div data-testid="row-count">{rows.length}</div>
        <button onClick={addRow}>add row</button>
      </div>
    );
  }
}));

import TextDocumentEditor from "../TextDocumentEditor";

const renderEditor = (asset: Asset) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <TextDocumentEditor asset={asset} />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const csvAsset = (name: string): Asset =>
  stub<Asset>({
    id: "asset-1",
    name,
    content_type: "text/csv",
    get_url: `http://localhost/${name}`
  });

const markdownAsset = (): Asset =>
  stub<Asset>({
    id: "md-1",
    name: "notes.md",
    content_type: "text/markdown",
    get_url: "http://localhost/notes.md"
  });

describe("TextDocumentEditor — markdown edit", () => {
  it("opens from the preview cache without getting stuck on the spinner", async () => {
    // View mode already loaded the file. A hanging refetch must not leave the
    // editor on the spinner — that is what "click Edit" used to do.
    installGlobal(
      "fetch",
      jest.fn().mockImplementation(() => new Promise(() => {}))
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } }
    });
    queryClient.setQueryData(["textAsset", "md-1"], "# Hello");
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <TextDocumentEditor asset={markdownAsset()} />
        </ThemeProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId("monaco")).toBeInTheDocument();
  });
});

describe("TextDocumentEditor — leaving with an unsaved draft", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  // study-7-I1: switching to View unmounted the editor and dropped the draft.
  it("saves the draft and hands it to the preview when the editor unmounts", async () => {
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({ ok: true, text: async () => "# Untitled" })
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } }
    });
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <TextDocumentEditor asset={markdownAsset()} />
        </ThemeProvider>
      </QueryClientProvider>
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "type draft" })
    );
    unmount();

    expect(mockUpdate).toHaveBeenCalledWith({
      id: "md-1",
      data: "# Heater\n\nIt stopped working.",
      content_type: "text/markdown"
    });
    expect(queryClient.getQueryData(["textAsset", "md-1"])).toBe(
      "# Heater\n\nIt stopped working."
    );
  });

  it("does not save when nothing changed", async () => {
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({ ok: true, text: async () => "# Untitled" })
    );
    const { unmount } = renderEditor(markdownAsset());
    await screen.findByRole("button", { name: "type draft" });
    unmount();

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("TextDocumentEditor — CSV add row", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCsvText = (text: string) => {
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({ ok: true, text: async () => text })
    );
  };

  it("keeps the appended row for a single-column CSV", async () => {
    mockCsvText("name\nAda");
    renderEditor(csvAsset("rows.csv"));

    await waitFor(() =>
      expect(screen.getByTestId("row-count")).toHaveTextContent("1")
    );

    await userEvent.click(screen.getByRole("button", { name: "add row" }));

    expect(screen.getByTestId("row-count")).toHaveTextContent("2");
  });

  it("keeps the appended row for a multi-column CSV", async () => {
    mockCsvText("a,b\n1,2");
    renderEditor(csvAsset("rows.csv"));

    await waitFor(() =>
      expect(screen.getByTestId("row-count")).toHaveTextContent("1")
    );

    await userEvent.click(screen.getByRole("button", { name: "add row" }));

    expect(screen.getByTestId("row-count")).toHaveTextContent("2");
  });
});

describe("TextDocumentEditor — Markdown buttons", () => {
  beforeEach(() => mockExecuteEdits.mockReset());

  it("turns the caret's line into a heading in a Markdown file", async () => {
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({ ok: true, text: async () => "Heater broken" })
    );
    renderEditor(markdownAsset());
    await userEvent.click(await screen.findByText("mount"));
    await userEvent.click(screen.getByRole("button", { name: "Heading" }));

    expect(mockExecuteEdits).toHaveBeenCalledWith("toolbar", [
      expect.objectContaining({ text: "# Heater broken" })
    ]);
  });

  it("offers no Markdown buttons for other text formats", async () => {
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({ ok: true, text: async () => "{}" })
    );
    renderEditor(
      stub<Asset>({
        id: "json-1",
        name: "data.json",
        content_type: "application/json",
        get_url: "http://localhost/data.json"
      })
    );
    expect(await screen.findByTestId("monaco")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Heading" })
    ).not.toBeInTheDocument();
  });
});
