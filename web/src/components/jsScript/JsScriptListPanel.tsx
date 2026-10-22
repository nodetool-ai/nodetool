import AddIcon from "@mui/icons-material/AddOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
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

export const CreateJsScriptButton = memo(function CreateJsScriptButton() {
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
  const createJsScript = useCreateJsScript();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createJsScript.mutateAsync({
        name: t("list.defaultName"),
        projectId: creationProjectId()
      });
      openTab({
        type: "jsscript",
        ref: created.id,
        mode: "edit",
        title: created.name || t("list.defaultName"),
        projectId: created.projectId
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    } catch (error) {
      notifyMutationError(t("list.createError"), error);
    }
  }, [createJsScript, location.pathname, navigate, openTab, setVisibility, t]);

  return (
    <Tooltip title={t("list.newScript")} placement="right-start">
      <ToolbarIconButton
        ariaLabel={t("list.newScript")}
        onClick={() => void handleCreate()}
        loading={createJsScript.isPending}
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
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
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
        title: name || t("list.defaultName"),
        projectId
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, projectId, setVisibility, t]
  );

  return (
    <DocumentListPanel
      singular={t("list.singular")}
      plural={t("list.plural")}
      documents={data}
      isLoading={isLoading}
      isError={isError}
      errorMessage={error?.message}
      emptyDescription={t("list.empty")}
      deleteTarget={null}
      onCancelDelete={noop}
      onConfirmDelete={noop}
      matches={matchesDescription}
      renderItem={(script) => (
        <ListPanelItem
          id={script.id}
          name={script.name}
          fallbackName={t("list.defaultName")}
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
