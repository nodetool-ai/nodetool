import { useCallback, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SelectChangeEvent } from "../ui_primitives";

import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { NodeSelect, NodeMenuItem } from "../editor_ui";
import { FlexRow, ToolbarIconButton } from "../ui_primitives";

interface DocumentSummary {
  id: string;
  name?: string | null;
}

interface DocumentQueryResult {
  data?: readonly DocumentSummary[];
  error?: { message: string } | null;
  isLoading: boolean;
}

interface DocumentPickerPropertyProps extends PropertyProps {
  /** Document kind, used for the ref value, the workspace tab and the dom id. */
  documentType: "timeline" | "script" | "sketch";
  /** Lists the documents to choose from. Called as a hook — pass a stable one. */
  useDocuments: () => DocumentQueryResult;
  /** Shown for a document with no name of its own. */
  untitledLabel: string;
  /** Button label and tooltip, e.g. "Open in timeline editor". */
  openEditorLabel: string;
  icon: ReactNode;
  /**
   * Route for this document kind outside the workspace. Omit for a kind that
   * only exists as a workspace tab (scripts) — the button then navigates to the
   * workspace instead.
   */
  standaloneRoute?: (id: string) => string;
}

/**
 * Pick a persisted document of one kind and jump straight into its editor.
 * Shared by the `timeline`, `script` and `sketch` property editors.
 */
const DocumentPickerProperty = ({
  documentType,
  useDocuments,
  untitledLabel,
  openEditorLabel,
  icon,
  standaloneRoute,
  ...props
}: DocumentPickerPropertyProps) => {
  const { property, value, onChange } = props;
  const id = `${documentType}-${property.name}-${props.propertyIndex}`;
  const { data, error, isLoading } = useDocuments();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedId: string = value?.id || "";
  const selected = data?.find((document) => document.id === selectedId);

  const handleChange = useCallback(
    (e: SelectChangeEvent<unknown>) => {
      onChange({ type: documentType, id: String(e.target.value) });
    },
    [documentType, onChange]
  );

  const handleOpenEditor = useCallback(() => {
    if (!selectedId) {
      return;
    }
    const inWorkspace = location.pathname.startsWith("/workspace");
    if (standaloneRoute && !inWorkspace) {
      navigate(standaloneRoute(selectedId));
      return;
    }
    openTab({
      type: documentType,
      ref: selectedId,
      mode: "edit",
      title: selected?.name || untitledLabel
    });
    if (!inWorkspace) {
      navigate("/workspace");
    }
  }, [
    documentType,
    location.pathname,
    navigate,
    openTab,
    selected?.name,
    selectedId,
    standaloneRoute,
    untitledLabel
  ]);

  return (
    <>
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <FlexRow gap={0.5} align="center" fullWidth>
        <NodeSelect
          id={id}
          labelId={id}
          name=""
          value={selectedId}
          onChange={handleChange}
        >
          {isLoading && <NodeMenuItem disabled>Loading…</NodeMenuItem>}
          {error && <NodeMenuItem disabled>Error: {error.message}</NodeMenuItem>}
          {data?.map((document) => (
            <NodeMenuItem key={document.id} value={document.id}>
              {document.name || untitledLabel}
            </NodeMenuItem>
          ))}
        </NodeSelect>
        <ToolbarIconButton
          size="small"
          ariaLabel={openEditorLabel}
          tooltip={openEditorLabel}
          disabled={!selectedId}
          onClick={handleOpenEditor}
          icon={icon}
        />
      </FlexRow>
    </>
  );
};

export default DocumentPickerProperty;
