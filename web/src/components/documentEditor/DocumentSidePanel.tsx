/**
 * The switchable lower part of the document editor's right column: AI Chat
 * or Document Structure. With snapshots closed it fills the column; in
 * Snapshots Mode it sits below the snapshot list. The chat stays mounted
 * while Structure shows, so a running reply and the composer draft survive.
 */
import { memo, useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DockTabStrip, FlexColumn, type DockTab } from "../ui_primitives";
import DocumentAgentPanel from "./DocumentAgentPanel";
import DocumentOutlinePanel, {
  type DocumentOutlineSource
} from "./DocumentOutlinePanel";
import type { DocumentOutline } from "./DocumentOutlinePlugin";

export type DocumentSidePanelView = "chat" | "structure";

const VIEW_STORAGE_KEY = "nodetool.documentSidePanelView";

function readStoredView(): DocumentSidePanelView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "structure"
      ? "structure"
      : "chat";
  } catch {
    return "chat";
  }
}

function writeStoredView(view: DocumentSidePanelView): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

interface DocumentSidePanelProps {
  assetId: string;
  title?: string | null;
  flush: () => Promise<void>;
  getSelectedText: () => string;
  currentOutline: DocumentOutline | null;
  snapshotOutline: DocumentOutline | null;
  snapshotsOpen: boolean;
  hasSnapshot: boolean;
  onRevealCurrent: (key: string) => void;
}

const DocumentSidePanel = ({
  assetId,
  title,
  flush,
  getSelectedText,
  currentOutline,
  snapshotOutline,
  snapshotsOpen,
  hasSnapshot,
  onRevealCurrent
}: DocumentSidePanelProps) => {
  const { t } = useTranslation();
  const idPrefix = useId();
  const [view, setView] = useState<DocumentSidePanelView>(readStoredView);
  const [source, setSource] = useState<DocumentOutlineSource>("current");

  const tabs = useMemo<DockTab[]>(
    () => [
      { id: "chat", label: t("documentEditor.sidePanel.chat", "AI Chat") },
      {
        id: "structure",
        label: t("documentEditor.sidePanel.structure", "Structure")
      }
    ],
    [t]
  );

  const activate = useCallback((id: string) => {
    const next: DocumentSidePanelView = id === "structure" ? "structure" : "chat";
    setView(next);
    writeStoredView(next);
  }, []);

  return (
    <FlexColumn fullWidth sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <DockTabStrip
        tabs={tabs}
        activeId={view}
        ariaLabel={t("documentEditor.sidePanel.tabs", "Side panel")}
        onActivate={activate}
        panelIdPrefix={idPrefix}
      />
      <FlexColumn
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${view}`}
        fullWidth
        sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
      >
        <FlexColumn
          fullWidth
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: view === "chat" ? "flex" : "none"
          }}
        >
          <DocumentAgentPanel
            assetId={assetId}
            title={title}
            flush={flush}
            getSelectedText={getSelectedText}
          />
        </FlexColumn>
        {view === "structure" && (
          <DocumentOutlinePanel
            current={currentOutline}
            snapshot={snapshotOutline}
            snapshotsOpen={snapshotsOpen}
            hasSnapshot={hasSnapshot}
            source={source}
            onSourceChange={setSource}
            onRevealCurrent={onRevealCurrent}
          />
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(DocumentSidePanel);
