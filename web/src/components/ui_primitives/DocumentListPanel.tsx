/** @jsxImportSource @emotion/react */
// The shell every sidebar document list shares: filter box, loading/error/empty
// states, date-grouped rows, delete confirmation. Rows come from `renderItem`.

import { useTheme } from "@mui/material/styles";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import { groupByDate } from "../../utils/groupByDate";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { FlexColumn } from "./FlexColumn";
import { listPanelStyles } from "./listPanelStyles";
import { LoadingSpinner } from "./LoadingSpinner";
import { Text } from "./Text";

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
  renderItem
}: DocumentListPanelProps<T>) {
  const theme = useTheme();
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
      ? all.filter((item) => item.name.toLowerCase().includes(needle))
      : all;
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    let currentGroup = "";
    return sorted.map((item) => {
      const group = groupByDate(item.updatedAt);
      const showHeader = group !== currentGroup;
      currentGroup = group;
      return { item, group, showHeader };
    });
  }, [documents, filterValue]);

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={listPanelStyles(theme)}>
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={onCancelDelete}
        onConfirm={onConfirmDelete}
        title={`Delete ${singular}`}
        content={`Delete "${deleteTarget?.name ?? ""}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <div className="list-panel-search">
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder={`Search ${plural}...`}
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text={`Loading ${plural}`} />
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
            title={`Could not load ${plural}`}
            description={errorMessage ?? "Try again later."}
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
            title={filterValue ? `No matching ${plural}` : `No ${plural} yet`}
            description={
              filterValue ? "Try a different search term." : emptyDescription
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="list-panel-list" gap={0.5}>
          {rows.map(({ item, group, showHeader }) => (
            <Fragment key={item.id}>
              {showHeader && (
                <div className="date-header-row">
                  <Text
                    className="date-header"
                    size="small"
                    color="secondary"
                    weight={400}
                  >
                    {group}
                  </Text>
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
