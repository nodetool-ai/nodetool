/** @jsxImportSource @emotion/react */
import { Button, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { memo, useCallback } from "react";
import ThemeNodes from "../themes/ThemeNodes";
import { isEqual } from "lodash";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import NodeInfo from "../node_menu/NodeInfo";

const PrettyNamespace = memo<{ namespace: string }>(({ namespace }) => {
  const parts = namespace.split(".");
  return (
    <div className="pretty-namespace">
      {parts.map((part, index) => (
        <Typography
          key={index}
          component="span"
          style={{
            fontWeight: index === parts.length - 1 ? "500" : "300",
            color:
              index === parts.length - 1
                ? ThemeNodes.palette.c_gray4
                : "inherit"
          }}
        >
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
  backgroundColor?: string;
  nodeType: string;
}

export const NodeFooter: React.FC<NodeFooterProps> = ({
  nodeNamespace,
  metadata,
  backgroundColor,
  nodeType
}) => {
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
    <div className="node-footer" style={{ backgroundColor }}>
      <Tooltip
        title={
          <span>
            <span>
              <small>{nodeNamespace}</small>
            </span>
            <span style={{ display: "block" }}>Click to show in NodeMenu</span>
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
        title={<NodeInfo nodeMetadata={metadata} />}
      >
        <HelpOutlineIcon />
      </Tooltip>
    </div>
  );
};

export default memo(NodeFooter, isEqual);
