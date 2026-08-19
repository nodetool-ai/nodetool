---
name: sandbox-xlsx
description: Read and write Excel workbooks in a Code node or CodeAct action, with exceljs running on the host
---

# Excel workbooks in the sandbox

Specifier: `@nodetool-ai/sandbox-xlsx`. Import it at the top of the body.

exceljs is built on Node streams and ships its own zip layer; it will never be a
guest module. This pack is a **host module**: the import resolves to a generated
facade over NodeTool's own implementation.

## parse — workbook bytes to records

```js
import { parse } from "@nodetool-ai/sandbox-xlsx";

const bytes = await workspace.readBytes("report.xlsx");
const sheets = await parse(bytes);            // { "Sheet1": [...], "Costs": [...] }
const rows = await parse(bytes, { sheet: "Costs" });   // one sheet's rows
return { sheetNames: Object.keys(sheets), rows };
```

Options: `sheet` (name — returns that sheet's rows directly) and `header`
(default `true`; `false` gives raw cell arrays). Formula cells yield their
computed result, dates come back as ISO strings, and rich text is flattened.

Get the bytes from `workspace.readBytes`, or from a fetched body with
`await response.bytes()`.

## write — records to workbook bytes

```js
import { write } from "@nodetool-ai/sandbox-xlsx";

const bytes = await write({ Costs: inputs.rows, Notes: [{ note: "draft" }] });
await workspace.writeBytes("report.xlsx", bytes);
```

`{sheetName: rows}` is the short form. The long form is an array, one entry per
sheet, which is where per-sheet options live:

```js
const bytes = await write([
  {
    name: "Costs",
    rows: inputs.rows,
    columns: ["item", "usd"],                 // pin the column order
    styles: [
      { range: "A1:B1", bold: true, background: "FFE9A8" },
      { range: "B2:B999", numberFormat: "$#,##0.00" }
    ]
  }
]);
```

Rows are records by default, and the header is the union of their keys in
first-seen order unless `columns` pins it. `header: false` takes arrays of
cells instead and writes no header row. Column widths are fitted to the
content; pass `{ autoFitColumns: false }` to leave them alone. A style's
`range` is `A1` or `A1:C20`, and it takes `bold`, `italic`, `size`, `color`,
`background` (hex, with or without `#`) and `numberFormat`.

## Gotchas

- **Both exports are async.**
- **10 MB per workbook read.** Larger input is refused by name.
- **A missing sheet name throws**, and the error lists the sheets that exist.
- **`write` caps a workbook at 64 sheets and 250 000 cells.**
- **Values that are not a number, string, boolean or date are stored as JSON
  text.** A cell cannot hold bytes.
- **Nothing is saved for you.** `write` returns bytes; `workspace.writeBytes`
  (or `sandboxToAsset`) is what puts them somewhere.
