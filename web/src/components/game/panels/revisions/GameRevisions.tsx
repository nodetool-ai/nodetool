import React, { useState } from "react";
import RestoreIcon from "@mui/icons-material/Restore";

import {
  Caption, CONTROL, Dialog, FlexColumn, FlexRow, SPACING, Text, ToolbarIconButton
} from "../../../ui_primitives";

interface GameRevision {
  readonly revision: string;
  readonly modifiedAt: number;
  readonly current: boolean;
  readonly message: string | null;
}

interface GameRevisionsProps {
  readonly revisions: readonly GameRevision[];
  readonly busy: boolean;
  readonly onRestore: (revision: string) => Promise<void>;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Published revisions, newest first, each restorable into the draft after confirmation. */
export default function GameRevisions({ revisions, busy, onRestore }: GameRevisionsProps): React.ReactElement {
  const [pendingRevision, setPendingRevision] = useState<string | null>(null);
  return <FlexColumn sx={{ flex: 1, minHeight: 0 }}>
    {revisions.length === 0 && <Caption sx={{ px: SPACING.md, py: SPACING.sm }}>No published revisions yet.</Caption>}
    {revisions.length > 0 && <FlexColumn role="list" aria-label="Revisions"
      sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: SPACING.xs, px: SPACING.xs }}>
      {revisions.slice(0, 10).map((entry) => <FlexRow key={entry.revision} role="listitem" align="center" gap={SPACING.sm}
        sx={{ minHeight: CONTROL.height.lg, px: SPACING.sm, borderRadius: CONTROL.radius,
          "&:hover": { bgcolor: "action.hover" } }}>
        <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
          {entry.message
            ? <Text size="small" weight={400} truncate sx={{ color: "text.primary" }}>{entry.message}</Text>
            : <Text size="small" family="secondary" truncate sx={{ color: "text.primary" }}>{entry.revision.slice(0, 12)}</Text>}
          <FlexRow gap={SPACING.xs} align="baseline" sx={{ minWidth: 0 }}>
            <Caption>{DATE_FORMAT.format(new Date(entry.modifiedAt))}</Caption>
            {entry.current && <Caption color="primary">Current</Caption>}
          </FlexRow>
        </FlexColumn>
        <ToolbarIconButton icon={<RestoreIcon fontSize="small" />} tooltip="Restore to draft" disabled={busy}
          onClick={() => setPendingRevision(entry.revision)} />
      </FlexRow>)}
    </FlexColumn>}
    <Dialog open={pendingRevision !== null} title="Restore revision to draft" onClose={() => setPendingRevision(null)}
      confirmText="Restore to draft" isLoading={busy} showActions onConfirm={() => {
        if (!pendingRevision || busy) { return; }
        void onRestore(pendingRevision);
        setPendingRevision(null);
      }}>
      <Text>Restoring replaces the draft and clears its undo history.</Text>
    </Dialog>
  </FlexColumn>;
}
