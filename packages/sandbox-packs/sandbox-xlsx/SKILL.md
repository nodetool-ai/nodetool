---
name: sandbox-xlsx
description: Read Excel workbooks in a Code node or CodeAct action, with exceljs running on the host
---

# Excel workbooks in the sandbox

Specifier: `@nodetool-ai/sandbox-xlsx`. Declare it in the node's `packages`
property and import it at the top of the body.

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

## Gotchas

- **`parse` is async.**
- **10 MB per workbook.** Larger input is refused by name.
- **A missing sheet name throws**, and the error lists the sheets that exist.
- **Reading only.** There is no writer here; build a CSV with
  `@nodetool-ai/sandbox-csv` instead.
