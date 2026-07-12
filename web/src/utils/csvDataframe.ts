// Convert CSV/TSV text to/from a DataframeRef so the tabular editor
// (DataTable) and the MUI table view can render a text asset, while
// the canonical persisted form stays plain delimited text.

import Papa from "papaparse";
import type { DataframeRef } from "../stores/ApiTypes";

/** Tab-separated for `.tsv`, comma-separated otherwise. */
export const csvDelimiterFor = (name: string): string =>
  name.toLowerCase().endsWith(".tsv") ? "\t" : ",";

/**
 * Parse delimited text into a DataframeRef. The first row becomes the column
 * names; all values are typed as strings (CSV has no schema).
 */
export const parseCsvToDataframe = (
  text: string,
  delimiter: string
): DataframeRef => {
  const parsed = Papa.parse<string[]>(text.trim(), {
    delimiter,
    skipEmptyLines: true
  });
  const rows = parsed.data ?? [];
  const [header = [], ...body] = rows;
  const columns = header.length > 0 ? header : ["Column 1"];
  return {
    type: "dataframe",
    uri: "",
    columns: columns.map((name) => ({
      name: String(name),
      data_type: "string"
    })),
    data: body
  };
};

/** Serialize a DataframeRef back to delimited text (header + rows). */
export const dataframeToCsv = (df: DataframeRef, delimiter: string): string => {
  const fields = (df.columns ?? []).map((c) => c.name);
  const data = df.data ?? [];
  return Papa.unparse({ fields, data }, { delimiter });
};
