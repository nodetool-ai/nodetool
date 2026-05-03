import { memo } from "react";
import { SxProps } from "@mui/material";
import { Divider, ToolbarIconButton } from "../ui_primitives";
import { getShortcutTooltip } from "../../config/shortcuts";
import { isProduction } from "../../lib/env";

const workspacesEnabled = !isProduction;
const sandboxesEnabled = !isProduction;

const spacerStyle = { flexGrow: 1 } as const;
const dividerSx: SxProps = { my: 1, mx: "6px", borderColor: "rgba(255, 255, 255, 0.15)" };

// icons
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import ArticleIcon from "@mui/icons-material/Article";
import FolderIcon from "@mui/icons-material/Folder";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SvgFileIcon from "../SvgFileIcon";

interface VerticalToolbarProps {
    handleInspectorToggle: () => void;
    handleAssistantToggle: () => void;
    handleLogsToggle: () => void;
    handleJobsToggle: () => void;
    handleWorkspaceToggle: () => void;
    handleVersionsToggle: () => void;
    handleWorkflowToggle: () => void;
    handleWorkflowAssetsToggle: () => void;
    handleSandboxesToggle: () => void;
    handleAgentToggle: () => void;
    activeView: "inspector" | "assistant" | "logs" | "workspace" | "versions" | "workflow" | "jobs" | "workflowAssets" | "sandboxes" | "agent";
    panelVisible: boolean;
}

function VerticalToolbar({
    handleInspectorToggle,
    handleAssistantToggle,
    handleLogsToggle,
    handleJobsToggle,
    handleWorkspaceToggle,
    handleVersionsToggle,
    handleWorkflowToggle,
    handleWorkflowAssetsToggle,
    handleSandboxesToggle,
    handleAgentToggle,
    activeView,
    panelVisible
}: VerticalToolbarProps) {
    const isActive = (view: VerticalToolbarProps["activeView"]) =>
        activeView === view && panelVisible;

    return (
        <div className="vertical-toolbar">
            <ToolbarIconButton
                icon={<CenterFocusWeakIcon />}
                tooltip={getShortcutTooltip("toggleInspector")}
                tooltipPlacement="left-start"
                onClick={handleInspectorToggle}
                ariaLabel="Toggle Inspector panel (I)"
                className="inspector"
                active={isActive("inspector")}
            />

            <ToolbarIconButton
                icon={<SvgFileIcon iconName="assistant" svgProp={{ width: 18, height: 18 }} />}
                tooltip={getShortcutTooltip("toggleOperator")}
                tooltipPlacement="left-start"
                onClick={handleAssistantToggle}
                ariaLabel="Toggle Operator panel (O)"
                className="assistant"
                active={isActive("assistant")}
            />

            <ToolbarIconButton
                icon={<SmartToyIcon />}
                tooltip="Agent"
                tooltipPlacement="left-start"
                onClick={handleAgentToggle}
                ariaLabel="Toggle Agent panel"
                className="agent"
                active={isActive("agent")}
            />

            {workspacesEnabled && (
                <ToolbarIconButton
                    icon={<FolderIcon />}
                    tooltip="Workspace"
                    tooltipPlacement="left-start"
                    onClick={handleWorkspaceToggle}
                    ariaLabel="Toggle Workspace panel"
                    className="workspace"
                    active={isActive("workspace")}
                />
            )}

            <ToolbarIconButton
                icon={<HistoryIcon />}
                tooltip="Version History"
                tooltipPlacement="left-start"
                onClick={handleVersionsToggle}
                ariaLabel="Toggle Version History panel"
                className="versions"
                active={isActive("versions")}
            />

            <ToolbarIconButton
                icon={<SettingsIcon />}
                tooltip={getShortcutTooltip("toggleWorkflowSettings")}
                tooltipPlacement="left-start"
                onClick={handleWorkflowToggle}
                ariaLabel="Toggle Workflow Settings panel (W)"
                className="workflow"
                active={isActive("workflow")}
            />

            <ToolbarIconButton
                icon={<FolderSpecialIcon />}
                tooltip={
                    <div className="tooltip-span">
                        <div className="tooltip-title">Workflow Assets</div>
                        <div className="tooltip-key">
                            <kbd>3</kbd>
                        </div>
                    </div>
                }
                tooltipPlacement="left-start"
                onClick={handleWorkflowAssetsToggle}
                ariaLabel="Toggle Workflow Assets panel (3)"
                className="workflowAssets"
                active={isActive("workflowAssets")}
            />

            <div style={spacerStyle} />

            <Divider sx={dividerSx} />

            <ToolbarIconButton
                icon={<ArticleIcon />}
                tooltip={
                    <div className="tooltip-span">
                        <div className="tooltip-title">Logs</div>
                        <div className="tooltip-key">
                            <kbd>L</kbd>
                        </div>
                    </div>
                }
                tooltipPlacement="left-start"
                onClick={handleLogsToggle}
                ariaLabel="Toggle Logs panel (L)"
                className="logs"
                active={isActive("logs")}
            />

            {sandboxesEnabled && (
                <ToolbarIconButton
                    icon={<DesktopWindowsIcon />}
                    tooltip="Sandboxes"
                    tooltipPlacement="left-start"
                    onClick={handleSandboxesToggle}
                    ariaLabel="Toggle Sandboxes panel"
                    className="sandboxes"
                    active={isActive("sandboxes")}
                />
            )}

            <ToolbarIconButton
                icon={<WorkHistoryIcon />}
                tooltip="Jobs"
                tooltipPlacement="left-start"
                onClick={handleJobsToggle}
                ariaLabel="Toggle Jobs panel"
                className="jobs"
                active={isActive("jobs")}
            />
        </div>
    );
}

VerticalToolbar.displayName = "VerticalToolbar";

export default memo(VerticalToolbar);
