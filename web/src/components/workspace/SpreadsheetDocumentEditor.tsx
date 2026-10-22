/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SaveIcon from "@mui/icons-material/Save";

import type { Asset, DataframeRef } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useContextCommands } from "../../hooks/useContextCommands";
import type { ContextCommand } from "../../stores/CommandMenuStore";
import DataTable from "../node/DataTable/DataTable";
import ErrorBanner from "../support/ErrorBanner";
import {
  EditorButton,
  FlexColumn,
  LoadingSpinner,
  SelectField,
  SaveState,
  EmptyState
} from "../ui_primitives";
import { arrayBufferToBase64 } from "../audio_editor/audioSample";
import { isMac } from "../../utils/platform";
import isEqual from "../../utils/isEqual";
import {
  applyDataframeToWorksheet,
  loadWorkbook,
  workbookToBytes,
  worksheetToDataframe
} from "../../utils/xlsxDataframe";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const spreadsheetAssetKey = (id: string) => ["spreadsheetAsset", id] as const;

interface SpreadsheetDocumentEditorProps {
  asset: Asset;
  /** Show the workbook without editing or saving. */
  readOnly?: boolean;
  /** Whether the editor's tab is on screen; lists its commands in the Cmd+K menu. */
  active?: boolean;
}

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.background.default,
    color: theme.vars.palette.common.white,
    ".sheet-select": {
      minWidth: 160
    },
    ".table-host": {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      ".datatable.nowheel": {
        height: "100%"
      },
      ".datatable.nowheel > .datatable": {
        flex: 1,
        minHeight: 0
      }
    }
  });

/**
 * The table editor for an Excel (.xlsx) asset. Each worksheet opens in the
 * DataTable editor, first row as header; a picker switches sheets and keeps
 * each sheet's edits. Saving writes only the changed cells back into the
 * workbook, so other sheets, styles and untouched formulas survive.
 */
const SpreadsheetDocumentEditor = ({
  asset,
  readOnly = false,
  active = false
}: SpreadsheetDocumentEditorProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const editorStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const update = useAssetStore((state) => state.update);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const getUrl = asset.get_url ?? undefined;

  const {
    data: workbook,
    isLoading,
    error
  } = useQuery({
    queryKey: spreadsheetAssetKey(asset.id),
    enabled: !!getUrl,
    staleTime: Infinity,
    queryFn: async () => {
      if (!getUrl) {
        throw new Error("Spreadsheet asset has no download URL");
      }
      const response = await fetch(getUrl);
      if (!response.ok) {
        throw new Error(`Failed to load spreadsheet: ${response.status}`);
      }
      return loadWorkbook(await response.arrayBuffer());
    }
  });

  // The dataframe each sheet was read as; edits are diffed against it on save.
  const loadedSheets = useMemo(
    () => (workbook?.worksheets ?? []).map(worksheetToDataframe),
    [workbook]
  );
  const [sheetIndex, setSheetIndex] = useState(0);
  const [edits, setEdits] = useState<Record<number, DataframeRef>>({});

  const activeIndex = sheetIndex < loadedSheets.length ? sheetIndex : 0;
  const dataframe = edits[activeIndex] ?? loadedSheets[activeIndex];
  const isDirty = useMemo(
    () =>
      Object.entries(edits).some(
        ([index, df]) => !isEqual(df, loadedSheets[Number(index)])
      ),
    [edits, loadedSheets]
  );

  const handleChange = useCallback(
    (df: DataframeRef) => {
      setEdits((current) => ({ ...current, [activeIndex]: df }));
    },
    [activeIndex]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workbook) {
        throw new Error("Spreadsheet is not loaded");
      }
      for (const [index, df] of Object.entries(edits)) {
        const i = Number(index);
        applyDataframeToWorksheet(workbook.worksheets[i], loadedSheets[i], df);
      }
      const bytes = await workbookToBytes(workbook);
      return update({
        id: asset.id,
        data: arrayBufferToBase64(bytes),
        data_encoding: "base64",
        content_type: XLSX_CONTENT_TYPE
      });
    },
    onSuccess: async () => {
      // Re-read the saved workbook so the baselines match what was written,
      // then drop the edits it now contains.
      await queryClient.invalidateQueries({
        queryKey: spreadsheetAssetKey(asset.id)
      });
      setEdits({});
      addNotification({
        type: "success",
        alert: true,
        content: `Saved ${asset.name}`,
        dismissable: false
      });
    },
    onError: (saveError) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to save ${asset.name}: ${saveError.message}`,
        dismissable: false
      });
    }
  });
  const isSaving = saveMutation.isPending;

  const handleSave = useCallback(() => {
    if (readOnly || !isDirty || isSaving) {
      return;
    }
    saveMutation.mutate();
  }, [readOnly, isDirty, isSaving, saveMutation]);

  const menuCommands = useMemo<ContextCommand[]>(
    () =>
      isDirty && !isSaving && !readOnly
        ? [
            {
              id: "save",
              label: t("i18n-next51.common.save"),
              run: handleSave,
              shortcut: isMac() ? "⌘S" : "Ctrl+S"
            }
          ]
        : [],
    [isDirty, isSaving, readOnly, handleSave]
  );
  useContextCommands("Spreadsheet", menuCommands, active);

  const sheetOptions = useMemo(
    () =>
      (workbook?.worksheets ?? []).map((sheet, index) => ({
        value: index,
        label: sheet.name
      })),
    [workbook]
  );

  if (error) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Spreadsheet failed to load",
            errorText: error.message
          }}
        >
          {t("i18n-next51.spreadsheet.loadError")}
        </ErrorBanner>
      </FlexColumn>
    );
  }
  if (isLoading || !workbook) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }
  if (!dataframe) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState size="small" variant="no-data" title={t("i18n-next51.spreadsheet.noSheets")} />
      </FlexColumn>
    );
  }

  return (
    <div css={editorStyles}>
      <div className="table-host">
        <DataTable
          // Each sheet gets its own table and undo history.
          key={activeIndex}
          dataframe={dataframe}
          editable={!readOnly}
          isModalMode
          onChange={readOnly ? undefined : handleChange}
          toolbarEnd={
            <>
              {sheetOptions.length > 1 && (
                <SelectField
                  className="sheet-select"
                  label={t("i18n-next51.spreadsheet.sheet")}
                  hideLabel
                  size="small"
                  value={activeIndex}
                  options={sheetOptions}
                  onChange={(value) => setSheetIndex(Number(value))}
                />
              )}
              <SaveState
                state={!readOnly && isDirty ? "dirty" : "idle"}
                showLabel={false}
              />
              {!readOnly && (
                <EditorButton
                  variant="contained"
                  size="small"
                  startIcon={<SaveIcon />}
                  disabled={!isDirty || isSaving}
                  onClick={handleSave}
                >
                  {isSaving ? t("i18n-next51.common.saving") : t("i18n-next51.common.save")}
                </EditorButton>
              )}
            </>
          }
        />
      </div>
    </div>
  );
};

export default SpreadsheetDocumentEditor;
