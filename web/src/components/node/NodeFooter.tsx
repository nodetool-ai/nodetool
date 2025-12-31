/** @jsxImportSource @emotion/react */
import {
  Button,
  Tooltip,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Badge
} from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import NodeInfo from "../node_menu/NodeInfo";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import useLogsStore from "../../stores/LogStore";
import { NodeLogsDialog } from "./NodeLogs";

const PrettyNamespace = memo<{ namespace: string }>(({ namespace }) => {
  const theme = useTheme();
  const parts = namespace.split(".");
  return (
    <div className="pretty-namespace">
      {parts.map((part, index) => (
        <Typography key={index} component="span">
          {part.replace("huggingface", "HF").replace("nodetool", "NT")}
          {index < parts.length - 1 && "."}
        </Typography>
      ))}
    </div>
  );
});

PrettyNamespace.displayName = "PrettyNamespace";

export interface NodeFooterProps {
  id: string;
  nodeNamespace: string;
  metadata: NodeMetadata;
  nodeType: string;
  data: NodeData;
  workflowId: string;
}

export const NodeFooter: React.FC<NodeFooterProps> = ({
  id,
  nodeNamespace,
  metadata,
  data,
  workflowId
}) => {
  const { openNodeMenu } = useNodeMenuStore((state) => ({
    openNodeMenu: state.openNodeMenu
  }));
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const logs = useLogsStore((state) => state.getLogs(workflowId, id));
  const logCount = logs?.length || 0;

  const [syncMenuAnchor, setSyncMenuAnchor] = useState<null | HTMLElement>(
    null
  );
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [isSyncTooltipOpen, setIsSyncTooltipOpen] = useState(false);

  const handleOpenNodeMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (metadata) {
        openNodeMenu({
          x: 500,
          y: 200,
          dropType: metadata.namespace,
          selectedPath: metadata.namespace.split(".")
        });
      }
    },
    [metadata, openNodeMenu]
  );

  const SyncModeIcon = ({ mode }: { mode: string }) => {
    // Minimalistic dot motif: 1 dot for on_any, 2 overlapping dots for zip_all
    const size = 16;
    const r = 2;

    if (mode === "zip_all") {
      return (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-label="zip_all"
          role="img"
          style={{ display: "block" }}
        >
          <circle
            cx={size / 2 - 2 + 0.5}
            cy={size / 2}
            r={r}
            fill="currentColor"
          />
          <circle
            cx={size / 2 + 2 + 0.5}
            cy={size / 2}
            r={r}
            fill="currentColor"
          />
        </svg>
      );
    }
    // Default: on_any → single dot
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="on_any"
        role="img"
        style={{ display: "block" }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="currentColor" />
      </svg>
    );
  };

  const openSyncMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSyncMenuAnchor(e.currentTarget);
    setIsSyncTooltipOpen(false);
  }, []);

  const closeSyncMenu = useCallback(() => {
    setSyncMenuAnchor(null);
    setIsSyncTooltipOpen(false);
  }, []);

  const handleSyncTooltipOpen = useCallback(() => {
    setIsSyncTooltipOpen(true);
  }, []);

  const handleSyncTooltipClose = useCallback(() => {
    setIsSyncTooltipOpen(false);
  }, []);

  const handleSelectMode = useCallback(
    (mode: "on_any" | "zip_all") => {
      updateNodeData(id, { sync_mode: mode });
      closeSyncMenu();
    },
    [id, updateNodeData, closeSyncMenu]
  );

  return (
    <div className="node-footer">
      <div className="footer-left">
        <Tooltip
          title={
            <span>
              <span className="node-footer-tooltip-title">{nodeNamespace}</span>
              <span className="node-footer-tooltip-subtitle">
                Click to show in NodeMenu
              </span>
            </span>
          }
          placement="bottom-start"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Button
            tabIndex={1}
            className="namespace-button"
            onClick={handleOpenNodeMenu}
          >
            <PrettyNamespace namespace={nodeNamespace} />
          </Button>
        </Tooltip>
      </div>

      <div className="footer-right">
        {logCount > 0 && (
          <Tooltip
            enterDelay={TOOLTIP_ENTER_DELAY}
            disableInteractive
            title={`View logs (${logCount})`}
            placement="bottom"
            arrow
          >
            <Button
              className="footer-icon-button logs-button"
              aria-label={`View logs (${logCount})`}
              onClick={() => setLogsDialogOpen(true)}
              size="small"
              sx={{ minWidth: "auto", padding: "4px" }}
            >
              <Badge
                badgeContent={logCount}
                color="default"
                max={99}
                sx={{
                  "& .MuiBadge-badge": {
                    fontSize: "0.6rem",
                    height: "14px",
                    minWidth: "14px",
                    padding: "0 3px"
                  }
                }}
              >
                <ListAltIcon sx={{ fontSize: "1rem" }} />
              </Badge>
            </Button>
          </Tooltip>
        )}
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          disableInteractive
          title={`Sync mode: ${data?.sync_mode || "on_any"}. Click to change.`}
          placement="bottom"
          arrow
          open={isSyncTooltipOpen}
          onOpen={handleSyncTooltipOpen}
          onClose={handleSyncTooltipClose}
        >
          <Button
            className="footer-icon-button sync-mode-button"
            aria-label={`Sync mode: ${data?.sync_mode || "on_any"}`}
            onClick={openSyncMenu}
            size="small"
            sx={{ minWidth: "auto", padding: "4px" }}
          >
            <SyncModeIcon mode={data?.sync_mode || "on_any"} />
          </Button>
        </Tooltip>
        <Tooltip
          placement="bottom-start"
          enterDelay={600}
          title={<NodeInfo nodeMetadata={metadata} menuWidth={250} />}
        >
          <Button
            className="footer-icon-button"
            size="small"
            sx={{ minWidth: "auto", padding: "4px" }}
          >
            <HelpOutlineIcon fontSize="small" />
          </Button>
        </Tooltip>

        <NodeLogsDialog
          id={id}
          workflowId={workflowId}
          open={logsDialogOpen}
          onClose={() => setLogsDialogOpen(false)}
        />

        <Menu
          anchorEl={syncMenuAnchor}
          open={Boolean(syncMenuAnchor)}
          onClose={closeSyncMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem disabled divider>
            <ListItemText
              primary="Select sync mode"
              secondary="How inputs are coordinated"
            />
          </MenuItem>
          <MenuItem
            selected={(data?.sync_mode || "on_any") === "on_any"}
            onClick={() => handleSelectMode("on_any")}
          >
            <ListItemIcon>
              <SyncModeIcon mode="on_any" />
            </ListItemIcon>
            <ListItemText
              primary="on_any"
              secondary="Run when any input arrives"
            />
          </MenuItem>
          <MenuItem
            selected={(data?.sync_mode || "on_any") === "zip_all"}
            onClick={() => handleSelectMode("zip_all")}
          >
            <ListItemIcon>
              <SyncModeIcon mode="zip_all" />
            </ListItemIcon>
            <ListItemText
              primary="zip_all"
              secondary="Wait for all inputs; process items together"
            />
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
};

export default memo(NodeFooter, isEqual);
