import type { ReactNode } from "react";
import { installGlobal, stub } from "../../../test-utils/doubles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset, DataframeRef } from "../../../stores/ApiTypes";

const mockUpdate = jest.fn();
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(selector: (s: { update: unknown }) => T) =>
    selector({ update: mockUpdate })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (s: { addNotification: unknown }) => T) =>
    selector({ addNotification: jest.fn() })
}));

const sheetFrame: DataframeRef = {
  type: "dataframe",
  uri: "",
  columns: [{ name: "Item", data_type: "string" }],
  data: [["Apple"]]
};
const mockWorkbook = { worksheets: [{ name: "Sales" }] };
const mockApply = jest.fn();
// exceljs is exercised in utils/__tests__/xlsxDataframe.test.ts; here the
// workbook is a stand-in so the test covers the editor's load and save flow.
jest.mock("../../../utils/xlsxDataframe", () => ({
  loadWorkbook: jest.fn(async () => mockWorkbook),
  worksheetToDataframe: jest.fn(() => sheetFrame),
  applyDataframeToWorksheet: (...args: unknown[]) => mockApply(...args),
  workbookToBytes: jest.fn(async () => new Uint8Array([1, 2, 3]).buffer)
}));

// Stand-in for the Tabulator-backed DataTable: shows the first cell and edits
// it through `onChange` the way the real table reports a cell edit.
jest.mock("../../node/DataTable/DataTable", () => ({
  __esModule: true,
  default: ({
    dataframe,
    onChange,
    toolbarEnd
  }: {
    dataframe: DataframeRef;
    onChange?: (df: DataframeRef) => void;
    toolbarEnd?: ReactNode;
  }) => (
    <div>
      <div data-testid="first-cell">{String(dataframe.data?.[0]?.[0])}</div>
      {onChange && (
        <button
          onClick={() => onChange({ ...dataframe, data: [["Pear"]] })}
        >
          edit cell
        </button>
      )}
      {toolbarEnd}
    </div>
  )
}));

import SpreadsheetDocumentEditor from "../SpreadsheetDocumentEditor";

const xlsxAsset = stub<Asset>({
  id: "xlsx-1",
  name: "budget.xlsx",
  content_type:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  get_url: "http://localhost/budget.xlsx"
});

const renderEditor = (readOnly = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <SpreadsheetDocumentEditor asset={xlsxAsset} readOnly={readOnly} />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("SpreadsheetDocumentEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(xlsxAsset);
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0)
      })
    );
  });

  it("saves an edited sheet back to the asset as xlsx", async () => {
    renderEditor();
    expect(await screen.findByTestId("first-cell")).toHaveTextContent("Apple");
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "edit cell" }));
    expect(screen.getByTestId("first-cell")).toHaveTextContent("Pear");
    await userEvent.click(save);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockApply).toHaveBeenCalledWith(
      mockWorkbook.worksheets[0],
      sheetFrame,
      expect.objectContaining({ data: [["Pear"]] })
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "xlsx-1",
      data: "AQID",
      data_encoding: "base64",
      content_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  });

  it("shows the sheet without editing or saving in read-only mode", async () => {
    renderEditor(true);
    expect(await screen.findByTestId("first-cell")).toHaveTextContent("Apple");
    expect(
      screen.queryByRole("button", { name: "edit cell" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save/i })
    ).not.toBeInTheDocument();
  });
});
