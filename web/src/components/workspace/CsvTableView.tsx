import { useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { csvDelimiterFor, parseCsvToDataframe } from "../../utils/csvDataframe";
import {
  Caption,
  DataTable,
  EmptyState,
  FlexColumn,
  ScrollArea
} from "../ui_primitives";

/** Cap CSV/TSV rows so a huge file can't lock up the table render. */
const MAX_CSV_ROWS = 2000;

/** Renders CSV text as a table. The `.status` and `.csv-note` classes are styled by the hosting preview. */
export const CsvTableView = ({ text, name }: { text: string; name: string }) => {
  const { t } = useTranslation();
  const { columns, rows, truncated } = useMemo(() => {
    const df = parseCsvToDataframe(text, csvDelimiterFor(name));
    const cols = (df.columns ?? []).map((c, i) => ({
      key: String(i),
      label: c.name
    }));
    const allRows = df.data ?? [];
    const mapped = allRows
      .slice(0, MAX_CSV_ROWS)
      .map((row) =>
        Object.fromEntries(
          row.map((cell, i) => [String(i), cell as ReactNode])
        )
      );
    return {
      columns: cols,
      rows: mapped,
      truncated: allRows.length > MAX_CSV_ROWS
    };
  }, [text, name]);

  if (columns.length === 0) {
    return (
      <FlexColumn className="status">
        <EmptyState
          size="small"
          variant="no-data"
          title={t("i18n-next51.common.tableEmpty")}
        />
      </FlexColumn>
    );
  }

  return (
    <ScrollArea direction="both" sx={{ width: "100%", height: "100%" }}>
      <DataTable columns={columns} rows={rows} compact bordered stickyHeader />
      {truncated && (
        <Caption className="csv-note">
          Showing first {MAX_CSV_ROWS} rows.
        </Caption>
      )}
    </ScrollArea>
  );
};
