/**
 * Pick a Markdown document of the current project as a `document` value
 * (document editor PRD R12, R13). The list comes from the project's document
 * index, so there is no upload step. The value names the document by asset
 * id, which a rename or a move does not change.
 */
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { trpc } from "../../trpc/client";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { NodeMenuItem, NodeSelect } from "../editor_ui";
import type { SelectChangeEvent } from "../ui_primitives";

const MARKDOWN_NAME = /\.(md|markdown)$/i;
const NONE = "";

/** The `document` value naming asset `assetId`. */
export const projectDocumentValue = (assetId: string) => ({
  type: "document" as const,
  uri: `asset://${assetId}`,
  asset_id: assetId,
  data: null,
  metadata: null
});

interface ProjectDocumentSelectProps {
  id: string;
  /** The picked asset id, or "" for none. */
  assetId: string;
  onChange: (value: ReturnType<typeof projectDocumentValue> | null) => void;
  /** Offer "None", which clears the value. */
  allowNone?: boolean;
}

const ProjectDocumentSelect = ({ id, assetId, onChange, allowNone }: ProjectDocumentSelectProps) => {
  const { t } = useTranslation();
  const activeProjectId = useWorkspaceTabsStore((state) => state.activeProjectId);
  const personalProjectId = useWorkspaceTabsStore((state) => state.personalProjectId);
  const projectId =
    activeProjectId && activeProjectId !== LOOSE_PROJECT_ID ? activeProjectId : personalProjectId;
  const { data, isLoading, error } = trpc.documents.index.useQuery(
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId), staleTime: 30_000, retry: false }
  );
  const documents = useMemo(
    () =>
      (data?.documents ?? []).filter(
        (entry) => entry.type === "text" && MARKDOWN_NAME.test(entry.name)
      ),
    [data]
  );
  const known = documents.some((entry) => entry.id === assetId);

  const handleChange = useCallback(
    (event: SelectChangeEvent<unknown>) => {
      const picked = String(event.target.value);
      onChange(picked === NONE ? null : projectDocumentValue(picked));
    },
    [onChange]
  );

  return (
    <NodeSelect
      id={id}
      labelId={id}
      name=""
      value={known || !assetId ? assetId : NONE}
      onChange={handleChange}
      displayEmpty
      aria-label={t("documentEditor.picker.label")}
    >
      <NodeMenuItem value={NONE} disabled={!allowNone}>
        {allowNone ? t("documentEditor.picker.none") : t("documentEditor.picker.placeholder")}
      </NodeMenuItem>
      {isLoading && <NodeMenuItem disabled>{t("documentEditor.picker.loading")}</NodeMenuItem>}
      {error && <NodeMenuItem disabled>{t("documentEditor.picker.error")}</NodeMenuItem>}
      {!isLoading && !error && documents.length === 0 && (
        <NodeMenuItem disabled>{t("documentEditor.picker.empty")}</NodeMenuItem>
      )}
      {documents.map((entry) => (
        <NodeMenuItem key={entry.id} value={entry.id}>
          {entry.name}
        </NodeMenuItem>
      ))}
    </NodeSelect>
  );
};

export default ProjectDocumentSelect;
