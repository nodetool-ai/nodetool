import { memo } from "react";
import { IconButton, SxProps } from "@mui/material";
import { Tooltip, Divider } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";

// Memoized styles to prevent object creation on each render
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
    handleAgentToggle: () => void;
    activeView: "inspector" | "assistant" | "logs" | "workspace" | "versions" | "workflow" | "jobs" | "workflowAssets" | "agent";
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
    handleAgentToggle,
    activeView,
    panelVisible
}: VerticalToolbarProps) {
    return (
        <div className="vertical-toolbar">
            {/* Workflow Tools Section */}
            {/* Inspector Button */}
            <Tooltip
                title={getShortcutTooltip("toggleInspector")}
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleInspectorToggle}
                    aria-label="Toggle Inspector panel (I)"
                    className={
                        activeView === "inspector" && panelVisible
                            ? "inspector active"
                            : "inspector"
                    }
                >
                    <CenterFocusWeakIcon />
                </IconButton>
            </Tooltip>

            {/* Assistant Button */}
            <Tooltip
                title={getShortcutTooltip("toggleOperator")}
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleAssistantToggle}
                    aria-label="Toggle Operator panel (O)"
                    className={
                        activeView === "assistant" && panelVisible
                            ? "assistant active"
                            : "assistant"
                    }
                >
                    <SvgFileIcon
                        iconName="assistant"
                        svgProp={{ width: 18, height: 18 }}
                    />
                </IconButton>
            </Tooltip>

            {/* Agent Button */}
            <Tooltip
                title="Agent"
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleAgentToggle}
                    aria-label="Toggle Agent panel"
                    className={
                        activeView === "agent" && panelVisible
                            ? "agent active"
                            : "agent"
                    }
                >
                    <SmartToyIcon />
                </IconButton>
            </Tooltip>

            {/* Workspace Button */}
            <Tooltip
                title="Workspace"
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleWorkspaceToggle}
                    aria-label="Toggle Workspace panel"
                    className={
                        activeView === "workspace" && panelVisible
                            ? "workspace active"
                            : "workspace"
                    }
                >
                    <FolderIcon />
                </IconButton>
            </Tooltip>

            {/* Versions Button */}
            <Tooltip
                title="Version History"
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleVersionsToggle}
                    aria-label="Toggle Version History panel"
                    className={
                        activeView === "versions" && panelVisible
                            ? "versions active"
                            : "versions"
                    }
                >
                    <HistoryIcon />
                </IconButton>
            </Tooltip>

            {/* Workflow Settings Button */}
            <Tooltip
                title={getShortcutTooltip("toggleWorkflowSettings")}
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleWorkflowToggle}
                    aria-label="Toggle Workflow Settings panel (W)"
                    className={
                        activeView === "workflow" && panelVisible
                            ? "workflow active"
                            : "workflow"
                    }
                >
                    <SettingsIcon />
                </IconButton>
            </Tooltip>

            {/* Workflow Assets Button */}
            <Tooltip
                title={
                    <div className="tooltip-span">
                        <div className="tooltip-title">Workflow Assets</div>
                        <div className="tooltip-key">
                            <kbd>3</kbd>
                        </div>
                    </div>
                }
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleWorkflowAssetsToggle}
                    aria-label="Toggle Workflow Assets panel (3)"
                    className={
                        activeView === "workflowAssets" && panelVisible
                            ? "workflowAssets active"
                            : "workflowAssets"
                    }
                >
                    <FolderSpecialIcon />
                </IconButton>
            </Tooltip>

            {/* Spacer to push runtime section to bottom */}
            <div style={spacerStyle} />

            {/* Divider between workflow tools and runtime section */}
            <Divider sx={dividerSx} />

            {/* Runtime Section - Logs and Jobs */}
            {/* Logs Button */}
            <Tooltip
                title={
                    <div className="tooltip-span">
                        <div className="tooltip-title">Logs</div>
                        <div className="tooltip-key">
                            <kbd>L</kbd>
                        </div>
                    </div>
                }
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleLogsToggle}
                    aria-label="Toggle Logs panel (L)"
                    className={
                        activeView === "logs" && panelVisible ? "logs active" : "logs"
                    }
                >
                    <ArticleIcon />
                </IconButton>
            </Tooltip>

            {/* Jobs Button */}
            <Tooltip
                title="Jobs"
                placement="left-start"
                delay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    onClick={handleJobsToggle}
                    aria-label="Toggle Jobs panel"
                    className={
                        activeView === "jobs" && panelVisible ? "jobs active" : "jobs"
                    }
                >
                    <WorkHistoryIcon />
                </IconButton>
            </Tooltip>
        </div>
    );
};

VerticalToolbar.displayName = "VerticalToolbar";

export default memo(VerticalToolbar);
