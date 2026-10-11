import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { CellComponent } from "tabulator-tables";
import mockTheme from "../../../../__mocks__/themeMock";
import DictTable from "../DictTable";

type CellEdited = (cell: CellComponent) => void;
const cellEditedHandlers: CellEdited[] = [];

jest.mock("tabulator-tables", () => ({
  TabulatorFull: class {
    on(event: string, handler: CellEdited) {
      if (event === "cellEdited") {
        cellEditedHandlers.push(handler);
      }
    }
    destroy() {}
  }
}));
jest.mock("../TableActions", () => ({
  __esModule: true,
  default: () => null
}));

const keyEdit = (
  oldKey: string,
  newKey: string,
  value: number
): { cell: CellComponent; restoreOldValue: jest.Mock } => {
  const restoreOldValue = jest.fn();
  const cell = {
    getField: () => "key",
    getData: () => ({ key: newKey, value }),
    getOldValue: () => oldKey,
    restoreOldValue
  } as unknown as CellComponent;
  return { cell, restoreOldValue };
};

const renderTable = (onDataChange: jest.Mock): CellEdited => {
  cellEditedHandlers.length = 0;
  render(
    <ThemeProvider theme={mockTheme}>
      <DictTable
        data={{ a: 1, b: 2 }}
        data_type="int"
        editable
        onDataChange={onDataChange}
      />
    </ThemeProvider>
  );
  return cellEditedHandlers[cellEditedHandlers.length - 1];
};

describe("DictTable", () => {
  it("rejects renaming a key onto another existing key", () => {
    const onDataChange = jest.fn();
    const onCellEdited = renderTable(onDataChange);
    const { cell, restoreOldValue } = keyEdit("a", "b", 1);

    onCellEdited(cell);

    expect(onDataChange).not.toHaveBeenCalled();
    expect(restoreOldValue).toHaveBeenCalled();
  });

  it("renames a key to a new name in place", () => {
    const onDataChange = jest.fn();
    const onCellEdited = renderTable(onDataChange);

    onCellEdited(keyEdit("a", "c", 1).cell);

    expect(onDataChange).toHaveBeenCalledWith({ c: 1, b: 2 });
  });
});
