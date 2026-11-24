/**
 * Separate review card for staged assistant edits (document editor PRD D2, R8,
 * R9). Shows a line-level diff against the base document, lets the user edit
 * the proposed text directly before accepting, or rejects the proposal without
 * writing to the document.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  convertOutsideWrite,
  identifyBlocks,
  mergeBlockDocuments,
  serializeMarkdownBlocks,
  splitMarkdownBlocks,
  type MarkdownBlockDocument
} from "@nodetool-ai/protocol";

import type { DocumentProposal } from "../../stores/DocumentProposalStore";
import {
  AlertBanner,
  Box,
  Caption,
  Card,
  CardActions,
  CardBody,
  CardHeader,
  Chip,
  Dialog,
  EditorButton,
  ExpandCollapseButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  SPACING,
  ScrollArea,
  TYPOGRAPHY,
  Text,
  TextInput,
  getSpacingPx
} from "../ui_primitives";

export interface DiffLine {
  kind: "unchanged" | "added" | "removed";
  text: string;
}

export interface ProposalReconciliation {
  kind: "clean" | "merged" | "conflict";
  mergedContent: string;
  conflictCount: number;
}

/**
 * Pairs unambiguous 1-to-1 in-place block replacements between two exact
 * anchors so a block rewritten with fewer than 50% shared words still keeps
 * its base block id during 3-way reconciliation.
 */
function alignInPlaceReplacements(
  base: MarkdownBlockDocument,
  doc: MarkdownBlockDocument
): MarkdownBlockDocument {
  const baseIndexById = new Map(
    base.blocks.map((block, index) => [block.id, index])
  );
  const docIds = new Set(doc.blocks.map((block) => block.id));
  const anchors: Array<[number, number]> = [[-1, -1]];
  let lastBaseIndex = -1;
  for (let docIndex = 0; docIndex < doc.blocks.length; docIndex++) {
    const baseIndex = baseIndexById.get(doc.blocks[docIndex].id);
    if (baseIndex !== undefined && baseIndex > lastBaseIndex) {
      anchors.push([baseIndex, docIndex]);
      lastBaseIndex = baseIndex;
    }
  }
  anchors.push([base.blocks.length, doc.blocks.length]);

  let changed = false;
  const nextBlocks = [...doc.blocks];
  for (let k = 0; k + 1 < anchors.length; k++) {
    const [bStart, dStart] = anchors[k];
    const [bEnd, dEnd] = anchors[k + 1];
    const missingBase: number[] = [];
    for (let i = bStart + 1; i < bEnd; i++) {
      if (!docIds.has(base.blocks[i].id)) {
        missingBase.push(i);
      }
    }
    const createdDoc: number[] = [];
    for (let j = dStart + 1; j < dEnd; j++) {
      if (!baseIndexById.has(doc.blocks[j].id)) {
        createdDoc.push(j);
      }
    }
    if (missingBase.length === 1 && createdDoc.length === 1) {
      const targetDocIndex = createdDoc[0];
      const baseId = base.blocks[missingBase[0]].id;
      nextBlocks[targetDocIndex] = {
        ...nextBlocks[targetDocIndex],
        id: baseId
      };
      changed = true;
    }
  }

  return changed ? { ...doc, blocks: nextBlocks } : doc;
}

/**
 * Reconciles a staged proposal draft against the document's live content via a
 * 3-way Markdown block merge.
 * - `"clean"`: document still matches `baseContent`; apply `draftContent`.
 * - `"merged"`: document changed in disjoint blocks; `mergedContent` preserves
 *   both the user's newer edits and the proposal's edits.
 * - `"conflict"`: overlapping edits exist; caller must ask the user before
 *   overwriting their edits with `draftContent`.
 */
export function reconcileProposalWithCurrent(
  baseContent: string,
  currentContent: string,
  draftContent: string
): ProposalReconciliation {
  if (currentContent === baseContent) {
    return {
      kind: "clean",
      mergedContent: draftContent,
      conflictCount: 0
    };
  }
  if (currentContent === draftContent) {
    return {
      kind: "merged",
      mergedContent: draftContent,
      conflictCount: 0
    };
  }

  let seq = 0;
  const nextId = () => `proposal-block-${++seq}`;
  const baseSplit = splitMarkdownBlocks(baseContent);
  const baseDoc: MarkdownBlockDocument = {
    leading: baseSplit.leading,
    blocks: identifyBlocks([], baseSplit.blocks, nextId)
  };
  const localDoc = alignInPlaceReplacements(
    baseDoc,
    convertOutsideWrite(baseDoc, currentContent, { kind: "person" }, nextId)
      .document
  );
  const proposedDoc = alignInPlaceReplacements(
    baseDoc,
    convertOutsideWrite(baseDoc, draftContent, { kind: "agent" }, nextId)
      .document
  );
  const merged = mergeBlockDocuments(baseDoc, localDoc, proposedDoc);

  // Detect overlapping new/rewritten blocks placed in the same surviving slot
  // (for example, both sides rewriting the same paragraph with unrelated words
  // or inserting at the same anchor) and conflicting leading whitespace.
  const baseIds = new Set(baseDoc.blocks.map((block) => block.id));
  const localIds = new Set(localDoc.blocks.map((block) => block.id));
  const remoteIds = new Set(proposedDoc.blocks.map((block) => block.id));
  const survivingBaseIds = new Set(
    [...baseIds].filter((id) => localIds.has(id) && remoteIds.has(id))
  );

  const creationAnchors = (doc: MarkdownBlockDocument): Set<string | null> => {
    const anchors = new Set<string | null>();
    let lastSurviving: string | null = null;
    for (const block of doc.blocks) {
      if (survivingBaseIds.has(block.id)) {
        lastSurviving = block.id;
      } else if (!baseIds.has(block.id)) {
        anchors.add(lastSurviving);
      }
    }
    return anchors;
  };

  const localCreations = creationAnchors(localDoc);
  const remoteCreations = creationAnchors(proposedDoc);
  let extraConflicts = 0;
  for (const anchor of remoteCreations) {
    if (localCreations.has(anchor)) {
      extraConflicts++;
    }
  }
  if (
    localDoc.leading !== baseDoc.leading &&
    proposedDoc.leading !== baseDoc.leading &&
    localDoc.leading !== proposedDoc.leading
  ) {
    extraConflicts++;
  }

  const conflictCount = merged.conflicts.length + extraConflicts;
  if (conflictCount > 0) {
    return {
      kind: "conflict",
      mergedContent: draftContent,
      conflictCount
    };
  }

  return {
    kind: "merged",
    mergedContent: serializeMarkdownBlocks(merged.document),
    conflictCount: 0
  };
}

const MAX_LCS_CELLS = 250_000;

function splitLines(text: string): string[] {
  if (text === "") {
    return [];
  }
  return text.replace(/\r\n/g, "\n").split("\n");
}

/** Line-level diff between `before` and `after` with prefix/suffix trimming. */
export function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let prefix = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  const maxSuffix = Math.min(a.length - prefix, b.length - prefix);
  while (
    suffix < maxSuffix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const head: DiffLine[] = a
    .slice(0, prefix)
    .map((text) => ({ kind: "unchanged", text }));
  const tail: DiffLine[] =
    suffix > 0
      ? a.slice(a.length - suffix).map((text) => ({ kind: "unchanged", text }))
      : [];

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  if (midA.length === 0 && midB.length === 0) {
    return [...head, ...tail];
  }

  if (midA.length * midB.length > MAX_LCS_CELLS) {
    return [
      ...head,
      ...midA.map((text): DiffLine => ({ kind: "removed", text })),
      ...midB.map((text): DiffLine => ({ kind: "added", text })),
      ...tail
    ];
  }

  const m = midA.length;
  const n = midB.length;
  const dp: Uint32Array[] = Array.from(
    { length: m + 1 },
    () => new Uint32Array(n + 1)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (midA[i] === midB[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (midA[i] === midB[j]) {
      middle.push({ kind: "unchanged", text: midA[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      middle.push({ kind: "removed", text: midA[i] });
      i++;
    } else {
      middle.push({ kind: "added", text: midB[j] });
      j++;
    }
  }
  while (i < m) {
    middle.push({ kind: "removed", text: midA[i] });
    i++;
  }
  while (j < n) {
    middle.push({ kind: "added", text: midB[j] });
    j++;
  }

  return [...head, ...middle, ...tail];
}

export interface DocumentProposalPanelProps {
  proposal: DocumentProposal;
  currentContent: string;
  applying?: boolean;
  queuedProposal?: DocumentProposal | null;
  onDraftChange: (draft: string) => void;
  onAccept: (
    approvedContent: string,
    options?: { forceOverwrite?: boolean }
  ) => void | Promise<void>;
  onReject: () => void;
  onAcceptQueued?: () => void;
  onDismissQueued?: () => void;
}

export const DocumentProposalPanel = ({
  proposal,
  currentContent,
  applying = false,
  queuedProposal = null,
  onDraftChange,
  onAccept,
  onReject,
  onAcceptQueued,
  onDismissQueued
}: DocumentProposalPanelProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [mode, setMode] = useState<"diff" | "edit">("diff");
  const [expanded, setExpanded] = useState(true);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);

  const reconciliation = useMemo(
    () =>
      reconcileProposalWithCurrent(
        proposal.baseContent,
        currentContent,
        proposal.draftContent
      ),
    [proposal.baseContent, currentContent, proposal.draftContent]
  );

  const diffLines = useMemo(() => {
    if (reconciliation.kind === "clean") {
      return computeLineDiff(proposal.baseContent, proposal.draftContent);
    }
    if (reconciliation.kind === "merged") {
      return computeLineDiff(currentContent, reconciliation.mergedContent);
    }
    return computeLineDiff(currentContent, proposal.draftContent);
  }, [
    currentContent,
    proposal.baseContent,
    proposal.draftContent,
    reconciliation.kind,
    reconciliation.mergedContent
  ]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.kind === "added") {
        added++;
      } else if (line.kind === "removed") {
        removed++;
      }
    }
    return { added, removed };
  }, [diffLines]);

  const hasChanges = stats.added > 0 || stats.removed > 0;

  const handleAcceptClick = () => {
    if (reconciliation.kind === "conflict") {
      setConfirmOverwriteOpen(true);
      return;
    }
    if (reconciliation.kind === "merged") {
      void onAccept(reconciliation.mergedContent);
      return;
    }
    void onAccept(proposal.draftContent);
  };

  const handleConfirmOverwrite = () => {
    setConfirmOverwriteOpen(false);
    void onAccept(proposal.draftContent, { forceOverwrite: true });
  };

  return (
    <Box
      sx={{
        flexShrink: 0,
        padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <Card variant="inline" tone="info">
        <CardHeader
          divided={expanded}
          icon={
            <AutoAwesomeIcon
              fontSize="small"
              sx={{ color: theme.vars.palette.info.main }}
            />
          }
          title={t(
            "documentEditor.proposal.title",
            "Assistant proposed changes"
          )}
          subtitle={t(
            "documentEditor.proposal.subtitle",
            "Review or edit the proposed version before applying."
          )}
          trailing={
            <FlexRow align="center" gap={GAP.tight}>
              {stats.added > 0 && (
                <Chip
                  compact
                  size="small"
                  color="success"
                  label={`+${stats.added}`}
                />
              )}
              {stats.removed > 0 && (
                <Chip
                  compact
                  size="small"
                  color="error"
                  label={`-${stats.removed}`}
                />
              )}
              <ExpandCollapseButton
                expanded={expanded}
                onToggle={() => setExpanded((current) => !current)}
                expandTooltip={t(
                  "documentEditor.proposal.expand",
                  "Show proposal"
                )}
                collapseTooltip={t(
                  "documentEditor.proposal.collapse",
                  "Hide proposal"
                )}
              />
            </FlexRow>
          }
        />
        {expanded && (
          <>
            <CardBody>
              {queuedProposal && (
                <AlertBanner severity="info" compact>
                  <FlexRow
                    align="center"
                    justify="space-between"
                    gap={GAP.normal}
                    sx={{ flexWrap: "wrap" }}
                  >
                    <Text size="smaller">
                      {t(
                        "documentEditor.proposal.queuedBanner",
                        "A new proposal arrived while you have unsaved edits in this proposal draft."
                      )}
                    </Text>
                    <FlexRow align="center" gap={GAP.tight}>
                      <EditorButton
                        variant="text"
                        density="compact"
                        disabled={applying}
                        onClick={onDismissQueued}
                      >
                        {t(
                          "documentEditor.proposal.keepMyEdits",
                          "Keep my edits"
                        )}
                      </EditorButton>
                      <EditorButton
                        variant="outlined"
                        density="compact"
                        disabled={applying}
                        onClick={onAcceptQueued}
                      >
                        {t(
                          "documentEditor.proposal.replaceWithQueued",
                          "Replace with new proposal"
                        )}
                      </EditorButton>
                    </FlexRow>
                  </FlexRow>
                </AlertBanner>
              )}
              {reconciliation.kind === "merged" && (
                <AlertBanner severity="info" compact>
                  {t(
                    "documentEditor.proposal.mergedNotice",
                    "The document changed in other sections since this proposal was generated. Accept & merge applies this proposal on top of your current edits without overwriting them."
                  )}
                </AlertBanner>
              )}
              {reconciliation.kind === "conflict" && (
                <AlertBanner severity="warning" compact>
                  {t("documentEditor.proposal.conflictWarning", {
                    count: reconciliation.conflictCount,
                    defaultValue:
                      reconciliation.conflictCount === 1
                        ? "The document changed since this proposal was generated, with 1 conflicting section. Accepting will overwrite your overlapping edits."
                        : "The document changed since this proposal was generated, with {{count}} conflicting sections. Accepting will overwrite your overlapping edits."
                  })}
                </AlertBanner>
              )}
              {mode === "diff" ? (
                <ScrollArea
                  thin
                  maxHeight={260}
                  sx={{
                    backgroundColor: theme.vars.palette.background.default,
                    paddingY: PADDING.micro
                  }}
                >
                  {!hasChanges ? (
                    <Box sx={{ padding: PADDING.normal }}>
                      <Caption color="secondary">
                        {t(
                          "documentEditor.proposal.noChanges",
                          "No differences from the base version."
                        )}
                      </Caption>
                    </Box>
                  ) : (
                    <FlexColumn role="region" aria-label={t("documentEditor.proposal.diffLabel", "Proposed diff")}>
                      {diffLines.map((line, index) => {
                        const isAdded = line.kind === "added";
                        const isRemoved = line.kind === "removed";
                        const prefix = isAdded ? "+" : isRemoved ? "-" : " ";
                        return (
                          <Box
                            key={`${index}-${line.kind}`}
                            data-diff-kind={line.kind}
                            sx={{
                              ...TYPOGRAPHY.mono.code,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: SPACING.md,
                              paddingX: SPACING.md,
                              paddingY: SPACING.micro,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              borderLeft: isAdded
                                ? `2px solid ${theme.vars.palette.success.main}`
                                : isRemoved
                                  ? `2px solid ${theme.vars.palette.error.main}`
                                  : "2px solid transparent",
                              backgroundColor: isAdded
                                ? `rgba(${theme.vars.palette.success.mainChannel} / 0.12)`
                                : isRemoved
                                  ? `rgba(${theme.vars.palette.error.mainChannel} / 0.12)`
                                  : "transparent",
                              color: isRemoved
                                ? theme.vars.palette.text.secondary
                                : isAdded
                                  ? theme.vars.palette.text.primary
                                  : theme.vars.palette.text.secondary,
                              textDecoration: isRemoved
                                ? "line-through"
                                : "none"
                            }}
                          >
                            <Box
                              component="span"
                              aria-hidden="true"
                              sx={{
                                flexShrink: 0,
                                userSelect: "none",
                                color: isAdded
                                  ? theme.vars.palette.success.main
                                  : isRemoved
                                    ? theme.vars.palette.error.main
                                    : theme.vars.palette.text.disabled
                              }}
                            >
                              {prefix}
                            </Box>
                            <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                              {line.text || " "}
                            </Box>
                          </Box>
                        );
                      })}
                    </FlexColumn>
                  )}
                </ScrollArea>
              ) : (
                <TextInput
                  multiline
                  minRows={6}
                  maxRows={14}
                  monospace
                  value={proposal.draftContent}
                  onChange={(event) => onDraftChange(event.target.value)}
                  label={t(
                    "documentEditor.proposal.editLabel",
                    "Edit proposed version"
                  )}
                  hideLabel
                  disabled={applying}
                />
              )}
            </CardBody>
            <CardActions sx={{ justifyContent: "space-between" }}>
              <EditorButton
                variant="outlined"
                density="compact"
                startIcon={
                  mode === "diff" ? (
                    <EditOutlinedIcon />
                  ) : (
                    <VisibilityOutlinedIcon />
                  )
                }
                disabled={applying}
                onClick={() =>
                  setMode((current) => (current === "diff" ? "edit" : "diff"))
                }
              >
                {mode === "diff"
                  ? t(
                      "documentEditor.proposal.editAction",
                      "Edit proposed version"
                    )
                  : t("documentEditor.proposal.previewAction", "Preview diff")}
              </EditorButton>
              <FlexRow gap={GAP.normal} align="center">
                <EditorButton
                  variant="text"
                  density="compact"
                  disabled={applying}
                  onClick={onReject}
                >
                  {t("documentEditor.proposal.reject", "Reject")}
                </EditorButton>
                <EditorButton
                  variant="contained"
                  density="compact"
                  loading={applying}
                  onClick={handleAcceptClick}
                >
                  {reconciliation.kind === "merged"
                    ? t(
                        "documentEditor.proposal.acceptAndMerge",
                        "Accept & merge"
                      )
                    : t("documentEditor.proposal.accept", "Accept")}
                </EditorButton>
              </FlexRow>
            </CardActions>
          </>
        )}
      </Card>
      <Dialog
        open={confirmOverwriteOpen && reconciliation.kind === "conflict"}
        onClose={() => {
          if (!applying) {
            setConfirmOverwriteOpen(false);
          }
        }}
        title={t(
          "documentEditor.proposal.overwriteConfirmTitle",
          "Overwrite newer edits?"
        )}
        onConfirm={handleConfirmOverwrite}
        confirmText={t(
          "documentEditor.proposal.overwriteConfirmAction",
          "Overwrite my edits"
        )}
        cancelText={t("common.cancel", "Cancel")}
        destructive
        isLoading={applying}
      >
        <Text size="small">
          {t(
            "documentEditor.proposal.overwriteConfirmBody",
            "Newer edits in this document overlap with this proposal. Continuing will overwrite your conflicting edits."
          )}
        </Text>
      </Dialog>
    </Box>
  );
};

export default DocumentProposalPanel;
