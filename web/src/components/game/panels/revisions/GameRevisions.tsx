import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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

/** Published revisions, newest first, each restorable into the draft after confirmation. */
export default function GameRevisions({ revisions, busy, onRestore }: GameRevisionsProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" });
  const [pendingRevision, setPendingRevision] = useState<string | null>(null);
  return <FlexColumn sx={{ flex: 1, minHeight: 0 }}>
    {revisions.length === 0 && <Caption sx={{ px: SPACING.md, py: SPACING.sm }}>{t("screen_game.revisions.empty")}</Caption>}
    {revisions.length > 0 && <FlexColumn role="list" aria-label={t("screen_game.revisions.listLabel")}
      sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: SPACING.xs, px: SPACING.xs }}>
      {revisions.slice(0, 10).map((entry) => <FlexRow key={entry.revision} role="listitem" align="center" gap={SPACING.sm}
        sx={{ minHeight: CONTROL.height.lg, px: SPACING.sm, borderRadius: CONTROL.radius,
          "&:hover": { bgcolor: "action.hover" } }}>
        <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
          {entry.message
            ? <Text size="small" weight={400} truncate sx={{ color: "text.primary" }}>{entry.message}</Text>
            : <Text size="small" family="secondary" truncate sx={{ color: "text.primary" }}>{entry.revision.slice(0, 12)}</Text>}
          <FlexRow gap={SPACING.xs} align="baseline" sx={{ minWidth: 0 }}>
            <Caption>{dateFormat.format(new Date(entry.modifiedAt))}</Caption>
            {entry.current && <Caption color="primary">{t("screen_game.revisions.current")}</Caption>}
          </FlexRow>
        </FlexColumn>
        <ToolbarIconButton icon={<RestoreIcon fontSize="small" />} tooltip={t("screen_game.revisions.restoreToDraft")} disabled={busy}
          onClick={() => setPendingRevision(entry.revision)} />
      </FlexRow>)}
    </FlexColumn>}
    <Dialog open={pendingRevision !== null} title={t("screen_game.revisions.confirmTitle")} onClose={() => setPendingRevision(null)}
      confirmText={t("screen_game.revisions.restoreToDraft")} isLoading={busy} showActions onConfirm={() => {
        if (!pendingRevision || busy) { return; }
        void onRestore(pendingRevision);
        setPendingRevision(null);
      }}>
      <Text>{t("screen_game.revisions.confirmDescription")}</Text>
    </Dialog>
  </FlexColumn>;
}
