/** @jsxImportSource @emotion/react */
// The shell every sidebar document list shares: filter box, loading/error/empty
// states, date-grouped rows, delete confirmation. Rows come from `renderItem`.

import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import { groupByDate } from "../../utils/groupByDate";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { FlexColumn } from "./FlexColumn";
import { listPanelStyles } from "./listPanelStyles";
import { LoadingSpinner } from "./LoadingSpinner";

export interface DocumentListPanelDocument {
  id: string;
  name: string;
  updatedAt: string;
}

export interface DocumentListPanelProps<T extends DocumentListPanelDocument> {
  /** Lowercase singular noun, e.g. "sketch". Titles the delete dialog. */
  singular: string;
  /** Lowercase plural noun, e.g. "sketches". Fills search, loading, error and empty copy. */
  plural: string;
  documents: readonly T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  /** Optional action shown alongside an error, such as bug reporting. */
  errorAction?: ReactNode;
  /** Shown under "No <plural> yet" when the user has not created any. */
  emptyDescription: string;
  /** The document awaiting delete confirmation; `null` keeps the dialog closed. */
  deleteTarget: { name: string } | null;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  renderItem: (document: T) => ReactNode;
  /** Extra match for the search box, e.g. a description. The name always matches. */
  matches?: (document: T, needle: string) => boolean;
}

export function DocumentListPanel<T extends DocumentListPanelDocument>({
  singular,
  plural,
  documents,
  isLoading,
  isError,
  errorMessage,
  errorAction,
  emptyDescription,
  deleteTarget,
  onCancelDelete,
  onConfirmDelete,
  renderItem,
  matches
}: DocumentListPanelProps<T>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [filterValue, setFilterValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const autoFocusEnabled = useAutoFocusEnabled();

  // Focus the filter on open so users can immediately type to search — except
  // on touch, where the virtual keyboard would cover the list.
  useEffect(() => {
    if (autoFocusEnabled) {
      searchRef.current?.focus();
    }
  }, [autoFocusEnabled]);

  const rows = useMemo(() => {
    const all = documents ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter(
          (item) =>
            item.name.toLowerCase().includes(needle) ||
            (matches?.(item, needle) ?? false)
        )
      : all;
    // Parsed once per row instead of twice per comparison — this whole pass
    // re-runs on every keystroke in the filter box.
    const sorted = filtered
      .map((item) => ({ item, updatedAt: Date.parse(item.updatedAt) }))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    // One `now` for the whole pass; `groupByDate` otherwise builds a fresh
    // Date per row.
    const now = new Date();
    let currentGroup = "";
    return sorted.map(({ item }) => {
      const group = groupByDate(item.updatedAt, now);
      const showHeader = group !== currentGroup;
      currentGroup = group;
      return { item, group, showHeader };
    });
  }, [documents, filterValue, matches]);

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={listPanelStyles(theme)}>
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={onCancelDelete}
        onConfirm={onConfirmDelete}
        title={t("i18n-next87.documentListPanel.deleteTitle", { singular })}
        content={t("i18n-next87.documentListPanel.deleteConfirmation", {
          name: deleteTarget?.name ?? ""
        })}
        confirmText={t("i18n-next87.documentListPanel.delete")}
        cancelText={t("i18n-next87.documentListPanel.cancel")}
      />
      <div className="list-panel-search">
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder={t("i18n-next87.documentListPanel.search", { plural })}
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner
            size="large"
            text={t("i18n-next87.documentListPanel.loading", { plural })}
          />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            variant="error"
            title={t("i18n-next87.documentListPanel.loadError", { plural })}
            description={
              errorMessage ?? t("i18n-next87.documentListPanel.tryAgainLater")
            }
          />
          {errorAction}
        </FlexColumn>
      ) : rows.length === 0 ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            title={
              filterValue
                ? t("i18n-next87.documentListPanel.noMatching", { plural })
                : t("i18n-next87.documentListPanel.noneYet", { plural })
            }
            description={
              filterValue
                ? t("i18n-next87.documentListPanel.tryDifferentSearch")
                : emptyDescription
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="list-panel-list" gap={0.5}>
          {rows.map(({ item, group, showHeader }) => (
            <Fragment key={item.id}>
              {showHeader && (
                <div className="date-header-row">
                  <span className="date-header">{group}</span>
                </div>
              )}
              {renderItem(item)}
            </Fragment>
          ))}
        </FlexColumn>
      )}
    </FlexColumn>
  );
}
