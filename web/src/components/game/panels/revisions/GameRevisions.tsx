import React, { useState } from "react";
import { Caption, Dialog, EditorButton, FlexRow, SPACING, Text } from "../../../ui_primitives";

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

export default function GameRevisions({ revisions, busy, onRestore }: GameRevisionsProps): React.ReactElement {
  const [pendingRevision, setPendingRevision] = useState<string | null>(null);
  return <>{revisions.slice(0, 10).map((entry) => <FlexRow key={entry.revision} gap={SPACING.xs} align="center">
    <Caption>{entry.message || entry.revision.slice(0, 12)} · {new Date(entry.modifiedAt).toLocaleString()}{entry.current ? " · Current" : ""}</Caption>
    <EditorButton disabled={busy} onClick={() => setPendingRevision(entry.revision)}>Restore to draft</EditorButton>
  </FlexRow>)}
    <Dialog open={pendingRevision !== null} title="Restore revision to draft" onClose={() => setPendingRevision(null)}
      confirmText="Restore to draft" isLoading={busy} showActions onConfirm={() => {
        if (!pendingRevision || busy) { return; }
        void onRestore(pendingRevision);
        setPendingRevision(null);
      }}>
      <Text>Restoring replaces the draft and clears its undo history.</Text>
    </Dialog>
  </>;
}
