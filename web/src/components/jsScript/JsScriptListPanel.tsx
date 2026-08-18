/** @jsxImportSource @emotion/react */
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import { memo, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateJsScript, useJsScripts } from "../../hooks/jsScript/useJsScripts";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { notifyMutationError } from "../../utils/notifyMutationError";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import {
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  ToolbarIconButton,
  Tooltip,
  TruncatedText,
  SPACING,
  listPanelStyles
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
        projectId: "default"
      });
      openTab({
        type: "jsscript",
        ref: created.id,
        mode: "edit",
        title: created.name || DEFAULT_NAME
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

/**
 * The left-panel browser for JS script documents: filter, then open one as a
 * workspace tab. Deliberately thinner than ScriptListPanel — rename, duplicate
 * and delete arrive with the versions UI in a later pass.
 */
const JsScriptListPanel = () => {
  const theme = useTheme();
  const [filterValue, setFilterValue] = useState("");
  const { data, isLoading, isError, error } = useJsScripts();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeScriptId = activeTabId?.startsWith("jsscript:")
    ? activeTabId.slice("jsscript:".length)
    : null;

  const scripts = useMemo(() => {
    const all = data ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter(
          (script) =>
            script.name.toLowerCase().includes(needle) ||
            script.description.toLowerCase().includes(needle)
        )
      : all;
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [data, filterValue]);

  const handleOpen = useCallback(
    (id: string, name: string) => {
      openTab({
        type: "jsscript",
        ref: id,
        mode: "edit",
        title: name || DEFAULT_NAME
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={listPanelStyles(theme)}>
      <div className="list-panel-search">
        <CategorySearchBar
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search JS scripts..."
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text="Loading JS scripts" />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            variant="error"
            title="Could not load JS scripts"
            description={error?.message ?? "Try again later."}
          />
        </FlexColumn>
      ) : scripts.length === 0 ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            title={filterValue ? "No matching JS scripts" : "No JS scripts yet"}
            description={
              filterValue
                ? "Try a different search term."
                : "Create a new JS script with the + button above."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="list-panel-list" gap={SPACING.xs}>
          {scripts.map((script) => (
            <button
              key={script.id}
              type="button"
              className={`list-panel-item ${
                script.id === activeScriptId ? "active" : ""
              }`}
              onClick={() => handleOpen(script.id, script.name)}
              aria-current={script.id === activeScriptId ? "page" : undefined}
            >
              <FlexRow align="center" gap={1} fullWidth>
                <DataObjectOutlinedIcon className="list-panel-icon" />
                <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
                  <TruncatedText
                    component="span"
                    sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
                  >
                    {script.name || DEFAULT_NAME}
                  </TruncatedText>
                  {script.description && (
                    <Text size="small" color="secondary" truncate>
                      {script.description}
                    </Text>
                  )}
                </FlexColumn>
              </FlexRow>
            </button>
          ))}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(JsScriptListPanel);
