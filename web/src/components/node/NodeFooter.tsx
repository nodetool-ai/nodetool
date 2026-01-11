/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
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
import isEqual from "lodash/isEqual";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import NodeInfo from "../node_menu/NodeInfo";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import useLogsStore from "../../stores/LogStore";
import { NodeLogsDialog } from "./NodeLogs";
import { ProcessTimer } from "./ProcessTimer";

const PrettyNamespace = memo<{ namespace: string }>(({ namespace }) => {
  const parts = namespace.split(".");
  let prefix = "";
  return (
    <div className="pretty-namespace">
      {parts.map((part) => {
        prefix = prefix ? `${prefix}.${part}` : part;
        const isLast = prefix === namespace;
        return (
          <Typography
            key={prefix}
            component="span"
            className={isLast ? "namespace-part-last" : undefined}
            sx={{
              fontWeight: isLast ? 500 : 300,
              color: isLast ? "var(--palette-grey-400)" : "inherit"
            }}
          >
            {part.replace("huggingface", "HF").replace("nodetool", "NT")}
            {!isLast && "."}
          </Typography>
        );
      })}
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
  status?: string | object | null;
}

export const NodeFooter: React.FC<NodeFooterProps> = ({
  id,
  nodeNamespace,
  metadata,
  data,
  workflowId,
  status
}) => {
  const rootCss = css({
    display: "flex",
    alignItems: "center",
    background: "transparent",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "0 0 8px 8px",
    overflow: "hidden",
    justifyContent: "space-between",
    padding: "4px 8px",
    minHeight: "24px"
  });

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
    <div className="node-footer" css={rootCss}>
      <div className="footer-left" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <Tooltip
          title={
            <span>
              <Typography
                component="span"
                sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
              >
                {nodeNamespace}
              </Typography>
              <Typography component="span" sx={{ display: "block" }}>
                Click to show in NodeMenu
              </Typography>
            </span>
          }
          placement="bottom-start"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Button
            tabIndex={1}
            className="namespace-button"
            onClick={handleOpenNodeMenu}
            sx={{
              display: "block",
              margin: "0 -4px",
              padding: "2px 8px",
              borderRadius: "4px",
              backgroundColor: "transparent",
              color: "var(--palette-grey-400)",
              fontSize: "9px",
              textTransform: "uppercase",
              textAlign: "left",
              flexGrow: 1,
              overflow: "hidden",
              letterSpacing: "0.05em",
              fontWeight: 500,
              minWidth: 0,
              "& .pretty-namespace": { display: "inline-block" },
              "&:hover": {
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                color: "var(--palette-primary-main)"
              },
              "&:hover .pretty-namespace span": {
                color: "var(--palette-primary-main) !important"
              }
            }}
          >
            <PrettyNamespace namespace={nodeNamespace} />
          </Button>
        </Tooltip>
        {status && <ProcessTimer status={status} />}
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
            sx={{
              minWidth: "auto",
              padding: "4px",
              "& svg": {
                transform: "scale(0.6)",
                opacity: 0.5,
                transition:
                  "opacity 0.2s ease, color 0.2s ease, transform 0.2s ease",
                cursor: "pointer"
              },
              "&:hover svg": {
                opacity: 1,
                color: "var(--palette-grey-0)",
                transform: "scale(0.7)"
              }
            }}
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
            sx={{
              minWidth: "auto",
              padding: "4px",
              "& svg": {
                transform: "scale(0.6)",
                opacity: 0.5,
                transition:
                  "opacity 0.2s ease, color 0.2s ease, transform 0.2s ease",
                cursor: "help"
              },
              "&:hover svg": {
                opacity: 1,
                color: "var(--palette-grey-0)",
                transform: "scale(0.7)"
              }
            }}
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
