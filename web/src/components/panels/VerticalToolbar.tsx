import { memo } from "react";
import { Tooltip, IconButton, Divider } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { SvgIconProps } from "@mui/material";

// icons
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import ArticleIcon from "@mui/icons-material/Article";
import FolderIcon from "@mui/icons-material/Folder";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
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
    activeView: "inspector" | "assistant" | "logs" | "workspace" | "versions" | "workflow" | "jobs" | "workflowAssets";
    panelVisible: boolean;
}

const VerticalToolbar = memo(function VerticalToolbar({
    handleInspectorToggle,
    handleAssistantToggle,
    handleLogsToggle,
    handleJobsToggle,
    handleWorkspaceToggle,
    handleVersionsToggle,
    handleWorkflowToggle,
    handleWorkflowAssetsToggle,
    activeView,
    panelVisible
}: VerticalToolbarProps) {
    return (
        <div className="vertical-toolbar">
            {/* Workflow Tools Section */}
            {/* Inspector Button */}
            <Tooltip
                title={
                    <div className="tooltip-span">
                        <div className="tooltip-title">Inspector</div>
                        <div className="tooltip-key">
                            <kbd>I</kbd>
                        </div>
                    </div>
                }
                placement="left-start"
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleInspectorToggle}
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
                title={
                    <div className="tooltip-span">
                        <div className="tooltip-title">Operator</div>
                        <div className="tooltip-key">
                            <kbd>O</kbd>
                        </div>
                    </div>
                }
                placement="left-start"
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleAssistantToggle}
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

            {/* Workspace Button */}
            <Tooltip
                title="Workspace"
                placement="left-start"
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleWorkspaceToggle}
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
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleVersionsToggle}
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
                title={
                    <div className="tooltip-span">
                        <div className="tooltip-title">Workflow Settings</div>
                        <div className="tooltip-key">
                            <kbd>W</kbd>
                        </div>
                    </div>
                }
                placement="left-start"
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleWorkflowToggle}
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
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleWorkflowAssetsToggle}
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
            <div style={{ flexGrow: 1 }} />

            {/* Divider between workflow tools and runtime section */}
            <Divider sx={{ my: 1, mx: "6px", borderColor: "rgba(255, 255, 255, 0.15)" }} />

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
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleLogsToggle}
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
                enterDelay={TOOLTIP_ENTER_DELAY}
            >
                <IconButton
                    tabIndex={-1}
                    onClick={handleJobsToggle}
                    className={
                        activeView === "jobs" && panelVisible ? "jobs active" : "jobs"
                    }
                >
                    <WorkHistoryIcon />
                </IconButton>
            </Tooltip>
        </div>
    );
});

export default VerticalToolbar;
