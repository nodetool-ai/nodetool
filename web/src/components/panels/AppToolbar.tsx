/** @jsxImportSource @emotion/react */
import { Button, Tooltip, Box } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { css } from "@emotion/react";
import { useLocation } from "react-router-dom";
import { memo, useCallback } from "react";
import { isEqual } from "lodash";
import { useCombo } from "../../stores/KeyPressedStore";
import { useNodes } from "../../contexts/NodeContext";
import { Workflow } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import {
  useGlobalHotkeys,
  DashboardButton,
  ChatButton,
  NodeMenuButton,
  SaveWorkflowButton,
  AutoLayoutButton,
  WorkflowModeSelect,
  RunWorkflowButton,
  StopWorkflowButton,
  RunAsAppButton,
  EditWorkflowButton,
  DownloadWorkflowButton,
  ShouldShowRunAsAppButton
} from "./toolbar/ToolbarButtons";

const styles = (theme: any) =>
  css({
    "&": {
      position: "absolute",
      top: "8px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: theme.palette.c_gray1
    },
    ".dashboard-button": {
      position: "absolute",
      left: "-520px",
      top: "-8px",
      width: "48px",
      height: "40px",
      backgroundColor: `${theme.palette.c_gray1}ee`,
      color: theme.palette.c_hl1,
      border: `2px solid ${theme.palette.c_gray3}`,
      borderRadius: "12px",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      backdropFilter: "blur(10px)",
      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
        borderColor: theme.palette.c_hl1,
        transform: "translateY(-2px) scale(1.05)",
        boxShadow: `0 8px 24px ${theme.palette.c_hl1}60, 0 0 40px ${theme.palette.c_hl1}30`,
        color: theme.palette.c_white
      },
      "&:active": {
        transform: "translateY(0) scale(0.98)"
      },
      "& svg": {
        fontSize: "26px",
        filter: "drop-shadow(0 0 4px rgba(0,0,0,0.3))"
      },
      "&::before": {
        content: '""',
        position: "absolute",
        top: "-2px",
        left: "-2px",
        right: "-2px",
        bottom: "-2px",
        background: `linear-gradient(45deg, ${theme.palette.c_hl1}20, transparent, ${theme.palette.c_hl2}20)`,
        borderRadius: "14px",
        opacity: 0,
        transition: "opacity 0.3s ease",
        zIndex: -1
      },
      "&:hover::before": {
        opacity: 1
      }
    },
    ".chat-button": {
      position: "absolute",
      left: "-580px",
      top: "-8px",
      width: "48px",
      height: "40px",
      backgroundColor: `${theme.palette.c_gray1}ee`,
      color: theme.palette.c_hl1,
      border: `2px solid ${theme.palette.c_gray3}`,
      borderRadius: "12px",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      backdropFilter: "blur(10px)",
      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
        borderColor: theme.palette.c_hl1,
        transform: "translateY(-2px) scale(1.05)",
        boxShadow: `0 8px 24px ${theme.palette.c_hl1}60, 0 0 40px ${theme.palette.c_hl1}30`,
        color: theme.palette.c_white
      },
      "&:active": {
        transform: "translateY(0) scale(0.98)"
      },
      "& svg": {
        fontSize: "26px",
        filter: "drop-shadow(0 0 4px rgba(0,0,0,0.3))"
      },
      "&::before": {
        content: '""',
        position: "absolute",
        top: "-2px",
        left: "-2px",
        right: "-2px",
        bottom: "-2px",
        background: `linear-gradient(45deg, ${theme.palette.c_hl1}20, transparent, ${theme.palette.c_hl2}20)`,
        borderRadius: "14px",
        opacity: 0,
        transition: "opacity 0.3s ease",
        zIndex: -1
      },
      "&:hover::before": {
        opacity: 1
      }
    },
    "&.actions": {
      fontSize: "12px",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.25em",
      backgroundColor: "transparent",
      margin: "0",
      padding: "0 1em"
    },
    ".mode-select": {
      top: "-2px",
      padding: "0",
      minWidth: "80px",
      marginRight: "12px",
      height: "24px",
      "& svg": {
        right: "2px"
      },
      "& .MuiInputBase-root": {
        height: "24px",
        minHeight: "24px"
      },
      "& .MuiSelect-select": {
        fontSize: "0.75rem",
        padding: "0px 8px",
        color: theme.palette.c_gray6,
        lineHeight: "24px",
        height: "24px"
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.palette.c_gray3
      }
    },
    ".status-message-container": {
      alignItems: "center",
      width: "300px"
    },
    ".action-button": {
      flexShrink: 0,
      width: "32px",
      height: "24px",
      minWidth: "32px",
      padding: "4px",
      color: theme.palette.c_gray6,
      position: "relative",
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      },
      "& svg": {
        fontSize: "20px",
        marginRight: "0",
        transition: "transform 0.1s ease"
      },
      "&:hover svg": {
        transform: "scale(1.1)"
      }
    },
    ".action-button.active": {
      border: `1px solid ${theme.palette.c_hl1}66`
    },
    ".action-button.disabled": {
      color: theme.palette.c_gray4,
      "&:hover": {
        boxShadow: "none"
      }
    },
    ".node-menu-button": {
      "& svg": {
        fill: `${theme.palette.c_hl1}cc`
      },
      "&:hover svg": {
        fill: `${theme.palette.c_hl1}ff`
      }
    },
    ".run-stop-button": {
      backgroundColor: `${theme.palette.c_gray2}cc`,
      color: theme.palette.c_hl1,
      minWidth: "40px",
      "&:hover": {
        boxShadow: `0 0 10px ${theme.palette.c_hl1}cc`,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
      },
      "&.disabled": {
        opacity: 0.5
      },
      "&.running": {
        "& svg": {
          animation:
            "spin 2s linear infinite, rainbow-rotate 3s linear infinite",
          color: theme.palette.c_hl1
        }
      }
    },
    ".stop-workflow": {
      marginRight: "0.7em"
    },
    ".run-status": {
      position: "absolute",
      top: "25px",
      fontSize: theme.fontSizeSmaller,
      padding: "0.2em 0.8em",
      color: theme.palette.c_gray6,
      boxShadow: `0 2px 8px ${theme.palette.c_gray1}40`
    },
    ".tooltip-span": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.1em"
    },
    ".tooltip-title": {
      fontSize: "1.2em",
      color: theme.palette.c_gray6
    },
    ".tooltip-key": {
      fontSize: "0.8em",
      color: theme.palette.c_gray6
    },
    "@keyframes pulse": {
      "0%": { opacity: 0.4 },
      "50%": { opacity: 1 },
      "100%": { opacity: 0.4 }
    },
    ".connecting-status": {
      animation: "pulse 1.5s infinite ease-in-out",
      color: theme.palette.c_hl1
    },
    "@keyframes rainbow-rotate": {
      "0%": { filter: "hue-rotate(0deg)" },
      "100%": { filter: "hue-rotate(360deg)" }
    },
    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
    },
    "@keyframes dashboardPulse": {
      "0%, 100%": {
        boxShadow: `0 0 0 0 ${theme.palette.c_hl1}40`
      },
      "50%": {
        boxShadow: `0 0 0 8px ${theme.palette.c_hl1}00`
      }
    },
    ".dashboard-button::after": {
      content: '""',
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "100%",
      height: "100%",
      borderRadius: "12px",
      animation: "dashboardPulse 2s infinite"
    }
  });


interface AppToolbarProps {
  setWorkflowToEdit: (workflow: Workflow) => void;
}

const AppToolbar: React.FC<AppToolbarProps> = ({ setWorkflowToEdit }) => {
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const path = useLocation().pathname;
  const { autoLayout, workflow } = useNodes((state) => ({
    autoLayout: state.autoLayout,
    workflow: state.workflow
  }));

  useCombo(["Ctrl+Space"], () =>
    openNodeMenu({
      x: 400,
      y: 200
    })
  );

  return (
    <>
      <Box sx={{ flexGrow: 1 }} />
      {path.startsWith("/editor") && (
        <div className="actions" css={styles}>
          <DashboardButton />
          <ChatButton />
          <>
            <NodeMenuButton />
            <EditWorkflowButton setWorkflowToEdit={setWorkflowToEdit} />
            <SaveWorkflowButton />
            <DownloadWorkflowButton />
            <AutoLayoutButton autoLayout={autoLayout} />
            <WorkflowModeSelect />
            <RunWorkflowButton />
            <StopWorkflowButton />
            {ShouldShowRunAsAppButton() && workflow?.settings?.run_mode === "app" && (
              <RunAsAppButton />
            )}
          </>
        </div>
      )}
    </>
  );
};

export default memo(AppToolbar, isEqual);
