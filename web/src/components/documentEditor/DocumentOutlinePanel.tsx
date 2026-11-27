/**
 * The heading tree of a document: one row per Markdown heading, indented by
 * level. A click jumps the page to that heading without animation. In
 * Snapshots Mode a switch picks the live document's tree or the selected
 * snapshot's, since headings can differ between versions.
 */
import { memo, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";

import {
  CONTROL,
  EmptyState,
  FlexColumn,
  FlexRow,
  ModeSwitch,
  PADDING,
  SPACING,
  ScrollArea,
  TreeRow,
  TruncatedText
} from "../ui_primitives";
import type { DocumentOutline } from "./DocumentOutlinePlugin";

export type DocumentOutlineSource = "current" | "snapshot";

/** Deeper levels share the last indent so long titles keep their width. */
const MAX_DEPTH = 4;

interface DocumentOutlinePanelProps {
  current: DocumentOutline | null;
  snapshot: DocumentOutline | null;
  /** Shows the Current/Snapshot switch. */
  snapshotsOpen: boolean;
  /** Whether a snapshot is selected in the list. */
  hasSnapshot: boolean;
  source: DocumentOutlineSource;
  onSourceChange: (source: DocumentOutlineSource) => void;
  /** Jumps to a heading of the live document. */
  onRevealCurrent: (key: string) => void;
}

const DocumentOutlinePanel = ({
  current,
  snapshot,
  snapshotsOpen,
  hasSnapshot,
  source,
  onSourceChange,
  onRevealCurrent
}: DocumentOutlinePanelProps) => {
  const { t } = useTranslation();
  const showingSnapshot = snapshotsOpen && source === "snapshot";
  const outline = showingSnapshot ? snapshot : current;
  const items = outline?.items ?? [];
  const minLevel = items.reduce((min, item) => Math.min(min, item.level), 6);

  const sourceOptions = useMemo(
    () =>
      [
        {
          value: "current",
          label: t("documentEditor.outline.current", "Current")
        },
        {
          value: "snapshot",
          label: t("documentEditor.outline.snapshot", "Snapshot")
        }
      ] as const,
    [t]
  );

  const reveal = (key: string): void => {
    if (showingSnapshot) {
      snapshot?.reveal(key);
    } else {
      onRevealCurrent(key);
    }
  };

  const empty = (): ReactElement => {
    let description = t(
      "documentEditor.outline.emptyBody",
      "Start a line with #, ## or ### to add a heading. Headings show up here so you can jump to them."
    );
    if (showingSnapshot) {
      description = hasSnapshot
        ? t(
            "documentEditor.outline.snapshotEmptyBody",
            "This snapshot has no headings."
          )
        : t(
            "documentEditor.outline.noSnapshotBody",
            "Select a snapshot to see its structure."
          );
    }
    return (
      <EmptyState
        size="small"
        icon={<AccountTreeOutlinedIcon />}
        title={t("documentEditor.outline.emptyTitle", "No headings")}
        description={description}
      />
    );
  };

  return (
    <FlexColumn fullWidth sx={{ flex: 1, minHeight: 0 }}>
      {snapshotsOpen && (
        <FlexRow
          align="center"
          sx={{
            flexShrink: 0,
            px: PADDING.normal,
            py: PADDING.compact,
            borderBottom: 1,
            borderColor: "divider"
          }}
        >
          <ModeSwitch
            ariaLabel={t("documentEditor.outline.source", "Structure of")}
            value={source}
            onChange={onSourceChange}
            options={sourceOptions}
          />
        </FlexRow>
      )}
      {items.length === 0 ? (
        <FlexColumn
          fullWidth
          sx={{ flex: 1, minHeight: 0, justifyContent: "center" }}
        >
          {empty()}
        </FlexColumn>
      ) : (
        <ScrollArea
          thin
          sx={{ flex: 1, minHeight: 0, py: PADDING.compact }}
        >
          <nav
            aria-label={
              showingSnapshot
                ? t("documentEditor.outline.snapshotLabel", "Snapshot structure")
                : t("documentEditor.outline.label", "Document structure")
            }
          >
            <FlexColumn
              component="ul"
              gap={SPACING.none}
              sx={{ listStyle: "none", m: 0, px: PADDING.compact }}
            >
              {items.map((item) => {
                const depth = Math.min(item.level - minLevel, MAX_DEPTH);
                const active = item.key === outline?.activeKey;
                return (
                  <li key={item.key}>
                    <TreeRow
                      component="button"
                      type="button"
                      interactive
                      selected={active}
                      depth={depth}
                      aria-current={active ? "location" : undefined}
                      onClick={() => reveal(item.key)}
                      sx={{
                        minHeight: CONTROL.height.sm,
                        fontWeight: item.level === minLevel ? 500 : 400
                      }}
                    >
                      <TruncatedText
                        component="span"
                        showTooltip
                        tooltipPlacement="left"
                        sx={{ font: "inherit", color: "inherit" }}
                      >
                        {item.text}
                      </TruncatedText>
                    </TreeRow>
                  </li>
                );
              })}
            </FlexColumn>
          </nav>
        </ScrollArea>
      )}
    </FlexColumn>
  );
};

export default memo(DocumentOutlinePanel);
