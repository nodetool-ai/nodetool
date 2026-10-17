import AddIcon from "@mui/icons-material/AddOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import { memo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateJsScript, useJsScripts } from "../../hooks/jsScript/useJsScripts";
import { usePanelStore } from "../../stores/PanelStore";
import {
  useWorkspaceTabsStore,
  creationProjectId
} from "../../stores/WorkspaceTabsStore";
import { notifyMutationError } from "../../utils/notifyMutationError";
import {
  DocumentListPanel,
  ListPanelItem,
  ToolbarIconButton,
  Tooltip
} from "../ui_primitives";

const DEFAULT_NAME = "Untitled JS script";

export const CreateJsScriptButton = memo(function CreateJsScriptButton() {
  const createJsScript = useCreateJsScript();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createJsScript.mutateAsync({
        name: DEFAULT_NAME,
        projectId: creationProjectId()
      });
      openTab({
        type: "jsscript",
        ref: created.id,
        mode: "edit",
        title: created.name || DEFAULT_NAME,
        projectId: created.projectId
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    } catch (error) {
      notifyMutationError("create the JS script", error);
    }
  }, [createJsScript, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New JS script" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New JS script"
        onClick={() => void handleCreate()}
        disabled={createJsScript.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

interface JsScriptListPanelProps {
  readonly projectId: string;
}

type JsScriptSummary = NonNullable<
  ReturnType<typeof useJsScripts>["data"]
>[number];

const noop = () => {};

const matchesDescription = (script: JsScriptSummary, needle: string) =>
  script.description.toLowerCase().includes(needle);

/**
 * The left-panel browser for JS script documents: filter, then open one as a
 * workspace tab. Deliberately thinner than ScriptListPanel — rename, duplicate
 * and delete arrive with the versions UI in a later pass.
 */
const JsScriptListPanel = ({ projectId }: JsScriptListPanelProps) => {
  const { data, isLoading, isError, error } = useJsScripts(projectId);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeScriptId = activeTabId?.startsWith("jsscript:")
    ? activeTabId.slice("jsscript:".length)
    : null;

  const handleOpen = useCallback(
    (id: string, name: string) => {
      openTab({
        type: "jsscript",
        ref: id,
        mode: "edit",
        title: name || DEFAULT_NAME,
        projectId
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, projectId, setVisibility]
  );

  return (
    <DocumentListPanel
      singular="JS script"
      plural="JS scripts"
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription="Create a new JS script with the + button above."
      deleteTarget={null}
      onCancelDelete={noop}
      onConfirmDelete={noop}
      matches={matchesDescription}
      renderItem={(script) => (
        <ListPanelItem
          id={script.id}
          name={script.name}
          fallbackName={DEFAULT_NAME}
          icon={DataObjectOutlinedIcon}
          active={script.id === activeScriptId}
          secondary={script.description || undefined}
          onOpen={handleOpen}
        />
      )}
    />
  );
};

export default memo(JsScriptListPanel);
