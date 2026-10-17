import type {
  CellComponent,
  ColumnDefinition,
  ColumnDefinitionAlign,
  Formatter
} from "tabulator-tables";

export const SELECT_COLUMN: ColumnDefinition = {
  title: "",
  field: "select",
  formatter: "rowSelection" as Formatter,
  titleFormatter: "rowSelection" as Formatter,
  hozAlign: "left" as ColumnDefinitionAlign,
  headerSort: false,
  width: 25,
  minWidth: 25,
  resizable: false,
  frozen: true,
  cellClick: function (_e: UIEvent, cell: CellComponent) {
    cell.getRow().toggleSelect();
  },
  editable: false,
  cssClass: "row-select"
};
