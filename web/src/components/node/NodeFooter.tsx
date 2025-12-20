/** @jsxImportSource @emotion/react */
import { Button, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import NodeInfo from "../node_menu/NodeInfo";

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
  nodeNamespace: string;
  metadata: NodeMetadata;
  nodeType: string;
}

export const NodeFooter: React.FC<NodeFooterProps> = ({
  nodeNamespace,
  metadata,
  nodeType
}) => {
  const theme = useTheme();
  const { openNodeMenu } = useNodeMenuStore((state) => ({
    openNodeMenu: state.openNodeMenu
  }));

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

  return (
    <div className="node-footer">
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
      <Tooltip
        placement="bottom-start"
        enterDelay={600}
        title={<NodeInfo nodeMetadata={metadata} menuWidth={250} />}
      >
        <HelpOutlineIcon />
      </Tooltip>
    </div>
  );
};

export default memo(NodeFooter, isEqual);
