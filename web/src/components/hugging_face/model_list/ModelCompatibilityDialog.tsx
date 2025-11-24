/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  List,
  ListItem,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import type {
  ModelCompatibilityResult,
  NodeCompatibilityInfo
} from "./useModelCompatibility";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";

const styles = (theme: Theme) =>
  css({
    "& .compatibility-section": {
      marginBottom: theme.spacing(2)
    },
    "& .section-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing(1)
    },
    "& .node-list": {
      maxHeight: 320,
      overflowY: "auto",
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      borderRadius: theme.shape.borderRadius,
      background: theme.vars.palette.background.paper
    },
    "& .node-list-item": {
      paddingTop: theme.spacing(0.75),
      paddingBottom: theme.spacing(0.75)
    },
    "& .node-row": {
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing(1)
    },
    "& .node-info": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.25)
    },
    "& .node-title": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    "& .node-type": {
      fontFamily: "var(--fontFamilyMono)",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary
    },
    "& .property-chip": {
      marginRight: theme.spacing(0.5),
      marginBottom: theme.spacing(0.5)
    },
    "& .node-meta": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      flexWrap: "wrap"
    },
    "& .empty-state": {
      color: theme.vars.palette.text.secondary
    }
  });

interface ModelCompatibilityDialogProps {
  open: boolean;
  onClose: () => void;
  model: UnifiedModel;
  compatibility: ModelCompatibilityResult;
}

const NodeList: React.FC<{
  items: NodeCompatibilityInfo[];
  label: string;
}> = ({ items, label }) => {
  if (items.length === 0) {
    return (
      <Typography variant="body2" className="empty-state">
        No {label.toLowerCase()} nodes found.
      </Typography>
    );
  }

  return (
    <List dense className="node-list">
      {items.map((node) => (
        <ListItem key={node.nodeType} disableGutters className="node-list-item">
          <div className="node-row">
            <div className="node-info">
              <Typography className="node-title" title={node.title}>
                {node.title}
              </Typography>
              <div className="node-meta">
                <span className="node-type">{node.nodeType}</span>
                {node.propertyNames.length > 0 && (
                  <div>
                    {node.propertyNames.map((name) => (
                      <Chip
                        key={name}
                        size="small"
                        label={name}
                        className="property-chip"
                        variant="outlined"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <CopyToClipboardButton
              copyValue={node.nodeType}
              title="Copy node type"
              tooltipPlacement="left"
            />
          </div>
        </ListItem>
      ))}
    </List>
  );
};

const ModelCompatibilityDialog: React.FC<ModelCompatibilityDialogProps> = ({
  open,
  onClose,
  model,
  compatibility
}) => {
  const theme = useTheme();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <div css={styles(theme)}>
        <DialogTitle>
          {model.repo_id || model.name}
          <Typography variant="body2" color="text.secondary">
            Nodes that can run this model
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <div className="compatibility-section">
            <div className="section-header">
              <Typography variant="subtitle2">Recommended</Typography>
              <Typography variant="caption">
                {compatibility.recommended.length} nodes
              </Typography>
            </div>
            <NodeList items={compatibility.recommended} label="recommended" />
          </div>

          <div className="compatibility-section">
            <div className="section-header">
              <Typography variant="subtitle2">Compatible</Typography>
              <Typography variant="caption">
                {compatibility.compatible.length} nodes
              </Typography>
            </div>
            <NodeList items={compatibility.compatible} label="compatible" />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
};

export default ModelCompatibilityDialog;
