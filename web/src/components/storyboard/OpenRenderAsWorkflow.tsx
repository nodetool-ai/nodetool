import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import {
  storyboardRenderToWorkflow,
  type PresetWorkflowGraph
} from "@nodetool-ai/presets";
import type { RenderInputs } from "@nodetool-ai/protocol";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { ToolbarIconButton } from "../ui_primitives";

export function OpenGraphAsWorkflow({
  build
}: {
  build: () => PresetWorkflowGraph;
}) {
  const { t } = useTranslation();
  const create = useWorkflowManager((s) => s.createNew);
  const open = async () => {
    try {
      const graph = build();
      const projectId = creationProjectId();
      const workflow = await create(projectId, {
        name: t("ejection.open"),
        graph: {
          nodes: graph.nodes.map(({ position, ...node }) => ({
            ...node,
            ui_properties: { position }
          })),
          edges: graph.edges
        }
      });
      useWorkspaceTabsStore.getState().openForegroundTab({
        type: "workflow",
        ref: workflow.id,
        title: workflow.name,
        mode: "edit",
        projectId
      });
    } catch (error) {
      useNotificationStore.getState().addNotification({
        type: "error",
        alert: true,
        content: t("ejection.failed", {
          reason: error instanceof Error ? error.message : String(error)
        })
      });
    }
  };
  return (
    <ToolbarIconButton
      icon={<AccountTreeOutlinedIcon fontSize="inherit" />}
      tooltip={t("ejection.open")}
      ariaLabel={t("ejection.open")}
      onClick={(event) => {
        event.stopPropagation();
        void open();
      }}
    />
  );
}

export default function OpenRenderAsWorkflow({
  record
}: {
  record: RenderInputs | undefined;
}) {
  const { t } = useTranslation();
  if (!record?.generation) {
    return (
      <ToolbarIconButton
        icon={<AccountTreeOutlinedIcon fontSize="inherit" />}
        tooltip={t("ejection.open")}
        ariaLabel={t("ejection.open")}
        onClick={(event) => {
          event.stopPropagation();
          useNotificationStore
            .getState()
            .addNotification({
              type: "warning",
              alert: true,
              content: t("ejection.unavailable")
            });
        }}
      />
    );
  }
  return (
    <OpenGraphAsWorkflow build={() => storyboardRenderToWorkflow(record)} />
  );
}
