import type { ReactNode } from "react";
import ExcelJS from "exceljs";
import { installGlobal, stub } from "../../../test-utils/doubles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset, DataframeRef } from "../../../stores/ApiTypes";
import { loadWorkbook, workbookToBytes } from "../../../utils/xlsxDataframe";

const mockUpdate = jest.fn();
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(selector: (s: { update: unknown }) => T) =>
    selector({ update: mockUpdate })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: unknown }) => T
  ) => selector({ addNotification: jest.fn() })
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
      {dataframe.data?.map((row, index) => (
        <input
          key={index}
          aria-label={`row ${index}`}
          value={String(row[0])}
          readOnly={!onChange}
          onChange={(event) =>
            onChange?.({
              ...dataframe,
              data: dataframe.data?.map((cells, r) =>
                r === index ? [event.target.value, ...cells.slice(1)] : cells
              )
            })
          }
        />
      ))}
      {onChange && (
        <button
          onClick={() =>
            onChange({
              ...dataframe,
              data: [["Pear"], ...(dataframe.data?.slice(1) ?? [])]
            })
          }
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

beforeEach(async () => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue(xlsxAsset);
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Sales").addRows([["Name"], ["original"], ["other"]]);
  workbook.addWorksheet("Notes").addRows([["Note"], ["untouched"]]);
  const bytes = await workbookToBytes(workbook);
  installGlobal(
    "fetch",
    jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes
    })
  );
});

describe("SpreadsheetDocumentEditor", () => {
  it("saves an edited sheet back to the asset as xlsx", async () => {
    renderEditor();
    expect(await screen.findByTestId("first-cell")).toHaveTextContent(
      "original"
    );
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "edit cell" }));
    expect(screen.getByTestId("first-cell")).toHaveTextContent("Pear");
    await userEvent.click(save);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const saved = await uploadedWorkbook(0);
    expect(saved.worksheets[0].getCell("A2").value).toBe("Pear");
    expect(saved.worksheets[1].getCell("A2").value).toBe("untouched");
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByTestId("first-cell")).toHaveTextContent("Pear");
  });

  it("shows the sheet without editing or saving in read-only mode", async () => {
    renderEditor(true);
    expect(await screen.findByTestId("first-cell")).toHaveTextContent(
      "original"
    );
    expect(
      screen.queryByRole("button", { name: "edit cell" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save/i })
    ).not.toBeInTheDocument();
  });
});

const uploadedWorkbook = async (index: number) => {
  const { data } = mockUpdate.mock.calls[index][0];
  return loadWorkbook(
    Uint8Array.from(atob(data), (char) => char.charCodeAt(0)).buffer
  );
};

const editRow = async (row: number, value: string) => {
  const input = screen.getByRole("textbox", { name: `row ${row}` });
  await userEvent.clear(input);
  await userEvent.type(input, value);
};

describe("spreadsheet save boundaries", () => {
  it("retries from persisted cells after a failed upload and a reverted edit", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("upload failed"));
    renderEditor();
    await screen.findByTestId("first-cell");
    await editRow(0, "first-edit");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled()
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    await editRow(0, "original");
    await editRow(1, "second-edit");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    const saved = await uploadedWorkbook(1);
    expect(saved.worksheets[0].getCell("A2").value).toBe("original");
    expect(saved.worksheets[0].getCell("A3").value).toBe("second-edit");
  });

  it.each(["newer-edit", "original"])(
    "keeps pending edits across sheets, including %s",
    async (newValue) => {
      let complete!: () => void;
      mockUpdate.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          })
      );
      renderEditor();
      await screen.findByTestId("first-cell");
      await editRow(0, "first-edit");
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      await editRow(0, newValue);
      await userEvent.click(screen.getByRole("combobox"));
      await userEvent.click(screen.getByRole("option", { name: "Notes" }));
      await editRow(0, "new-note");
      complete();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled()
      );
      expect(screen.getByRole("textbox", { name: "row 0" })).toHaveValue(
        "new-note"
      );
      const first = await uploadedWorkbook(0);
      expect(first.worksheets[0].getCell("A2").value).toBe("first-edit");
      expect(first.worksheets[1].getCell("A2").value).toBe("untouched");
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
      const second = await uploadedWorkbook(1);
      expect(second.worksheets[0].getCell("A2").value).toBe(newValue);
      expect(second.worksheets[1].getCell("A2").value).toBe("new-note");
    }
  );
});
