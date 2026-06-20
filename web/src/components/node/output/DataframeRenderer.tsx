/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { ToolbarIconButton, MOTION, BORDER_RADIUS } from "../../ui_primitives";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import isEqual from "fast-deep-equal";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { DataframeRef, ColumnDef } from "../../../stores/ApiTypes";
import DataTable from "../DataTable/DataTable";
import DataframeEditorModal from "../../properties/DataframeEditorModal";

interface DataframeRendererProps {
  dataframe: DataframeRef;
}

const inferColumnType = (
  rows: Array<Record<string, unknown>>,
  name: string
): string => {
  let sawNumber = false;
  let sawFloat = false;
  for (const row of rows) {
    const value = row?.[name];
    if (value == null || value === "") continue;
    if (typeof value === "number") {
      sawNumber = true;
      if (!Number.isInteger(value)) sawFloat = true;
      continue;
    }
    return "object";
  }
  if (!sawNumber) return "object";
  return sawFloat ? "float" : "int";
};

// The data nodes (@nodetool-ai/data-nodes) emit dataframes as { rows: [...] }
// rather than the canonical { columns, data } matrix that DataTable renders.
// Normalize row-records into the matrix form so those node outputs display
// instead of showing an empty table.
const normalizeDataframe = (dataframe: DataframeRef): DataframeRef => {
  if (dataframe.data && dataframe.data.length > 0) return dataframe;
  const rows = (
    dataframe as DataframeRef & { rows?: Array<Record<string, unknown>> }
  ).rows;
  if (!Array.isArray(rows) || rows.length === 0) return dataframe;

  const hasColumns = !!dataframe.columns && dataframe.columns.length > 0;
  const names = hasColumns
    ? dataframe.columns!.map((column) => column.name)
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row ?? {}))));
  const columns: ColumnDef[] = hasColumns
    ? dataframe.columns!
    : names.map((name) => ({ name, data_type: inferColumnType(rows, name) }));
  const data = rows.map((row) => names.map((name) => row?.[name] ?? null));
  return { ...dataframe, columns, data };
};

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    ".dataframe-action-buttons": {
      position: "absolute",
      right: "1.5em",
      top: "4px",
      opacity: 0,
      zIndex: 10,
      transition: `opacity ${MOTION.normal}`
    },
    "&:hover .dataframe-action-buttons": {
      opacity: 1
    },
    ".dataframe-action-buttons .MuiIconButton-root": {
      padding: "0.25em",
      color: theme.vars.palette.primary.main,
      borderRadius: BORDER_RADIUS.sm,
      "&:hover": {
        color: theme.vars.palette.primary.light,
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.1)`
      }
    },
    ".dataframe-action-buttons .MuiIconButton-root svg": {
      fontSize: "var(--fontSizeNormal)"
    }
  });

const DataframeRenderer: React.FC<DataframeRendererProps> = ({ dataframe }) => {
  const theme = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const normalized = useMemo(
    () => normalizeDataframe(dataframe),
    [dataframe]
  );

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        // Notify other dataframe modals to close
        window.dispatchEvent(new Event("close-dataframe-editor-modal"));
      }
      return next;
    });
  }, []);

  // Read-only onChange handler (no-op)
  const handleChange = useCallback(() => {
    // Read-only mode - do nothing
  }, []);

  return (
    <div css={styles(theme)} className="dataframe-renderer">
      <div className="dataframe-action-buttons">
        <ToolbarIconButton title="Open in Full View" size="small" onClick={toggleExpand}>
          <OpenInFullIcon />
        </ToolbarIconButton>
      </div>
      <DataTable dataframe={normalized} editable={false} />
      {isExpanded && (
        <DataframeEditorModal
          value={normalized}
          onChange={handleChange}
          onClose={toggleExpand}
          propertyName="DataFrame"
          propertyDescription="Read-only view of the DataFrame output"
          readOnly={true}
        />
      )}
    </div>
  );
};

export default memo(DataframeRenderer, isEqual);
