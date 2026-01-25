/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  List,
  ListItem,
  Chip,
  Box,
  IconButton,
  Stack
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import type {
  ModelCompatibilityResult,
  NodeCompatibilityInfo
} from "./useModelCompatibility";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { CopyButton } from "../../ui_primitives";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const styles = (theme: Theme) =>
  css({
    "& .compatibility-section": {
      marginBottom: theme.spacing(3),
      animation: `${fadeIn} 0.5s ease-out forwards`
    },
    "& .section-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing(1.5),
      padding: theme.spacing(0, 1)
    },
    "& .node-list": {
      maxHeight: 340,
      overflowY: "auto",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: theme.shape.borderRadius,
      background: theme.vars.palette.action.hover,
      "&::-webkit-scrollbar": {
        width: 6
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.action.disabledBackground,
        borderRadius: 3
      }
    },
    "& .node-list-item": {
      padding: theme.spacing(1.5, 2),
      transition: "all 0.2s ease",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": {
        borderBottom: "none"
      },
      "&:hover": {
        background: theme.vars.palette.action.selected,
        "& .copy-button": {
          opacity: 1
        }
      }
    },
    "& .recommended-item": {
      borderLeft: `3px solid ${theme.vars.palette.primary.main}`,
      background: `linear-gradient(90deg, ${theme.vars.palette.primary.main}11 0%, transparent 100%)`
    },
    "& .node-row": {
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing(1.5)
    },
    "& .node-info": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },
    "& .node-title-row": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },
    "& .node-title": {
      fontSize: "0.875rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    "& .node-type": {
      fontFamily: "var(--fontFamilyMono)",
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      opacity: 0.8
    },
    "& .property-chip": {
      height: 20,
      fontSize: "0.65rem",
      background: theme.vars.palette.action.hover,
      borderColor: theme.vars.palette.divider
    },
    "& .node-meta": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      flexWrap: "wrap",
      marginTop: theme.spacing(0.5)
    },
    "& .empty-state": {
      color: theme.vars.palette.text.disabled,
      textAlign: "center",
      padding: theme.spacing(4, 2),
      fontStyle: "italic",
      background: theme.vars.palette.action.hover,
      borderRadius: theme.shape.borderRadius,
      border: `1px dashed ${theme.vars.palette.divider}`
    },
    "& .copy-button": {
      opacity: 0,
      transition: "opacity 0.2s ease"
    }
  });

const NodeList: React.FC<{
  items: NodeCompatibilityInfo[];
  label: string;
  isRecommended?: boolean;
}> = ({ items, label, isRecommended }) => {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <Typography variant="body2" className="empty-state">
        No {label.toLowerCase()} nodes found for this model type.
      </Typography>
    );
  }

  return (
    <List disablePadding className="node-list">
      {items.map((node, index) => (
        <ListItem
          key={node.nodeType}
          disableGutters
          className={`node-list-item ${isRecommended ? "recommended-item" : ""}`}
          style={{ animationDelay: `${index * 0.05}s` }}
        >
          <div className="node-row">
            <div className="node-info">
              <div className="node-title-row">
                <Typography className="node-title" title={node.title}>
                  {node.title}
                </Typography>
                {isRecommended && (
                  <Chip
                    label="Best Match"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{
                      height: 16,
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      px: 0.5,
                      background: theme.vars.palette.primary.main + "22",
                      borderColor: theme.vars.palette.primary.main + "44"
                    }}
                  />
                )}
              </div>
              <div className="node-type">
                <TerminalRoundedIcon sx={{ fontSize: 12 }} />
                {node.nodeType}
              </div>
              {node.propertyNames.length > 0 && (
                <div className="node-meta">
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
            <div className="copy-button">
              <CopyButton
                value={node.nodeType}
                tooltip="Copy node type"
                tooltipPlacement="left"
              />
            </div>
          </div>
        </ListItem>
      ))}
    </List>
  );
};

interface ModelCompatibilityDialogProps {
  open: boolean;
  onClose: () => void;
  model: UnifiedModel;
  compatibility: ModelCompatibilityResult;
}

const ModelCompatibilityDialog: React.FC<ModelCompatibilityDialogProps> = ({
  open,
  onClose,
  model,
  compatibility
}) => {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          sx: {
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.background.paper,
            border: `1px solid ${theme.vars.palette.divider}`,
            backgroundImage: "none"
          }
        }
      }}
    >
      <div css={styles(theme)}>
        <DialogTitle sx={{ p: 3, pb: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <AutoAwesomeRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
                <Typography variant="h6" component="span" sx={{ fontWeight: 700, letterSpacing: -0.2 }}>
                  Node Compatibility
                </Typography>
              </Stack>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "var(--fontFamilyMono)",
                  color: "text.secondary",
                  background: theme.vars.palette.action.hover,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  border: `1px solid ${theme.vars.palette.divider}`
                }}
              >
                {model.repo_id || model.name}
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small" sx={{ color: "text.disabled", "&:hover": { color: "text.primary" } }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ p: 3, pt: 0 }}>
          <div className="compatibility-section">
            <div className="section-header">
              <Stack direction="row" spacing={1} alignItems="center">
                <VerifiedRoundedIcon sx={{ color: "primary.main", fontSize: 18 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "primary.main" }}>
                  Recommended Nodes
                </Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 500 }}>
                {compatibility.recommended.length} matches
              </Typography>
            </div>
            <NodeList items={compatibility.recommended} label="recommended" isRecommended />
          </div>

          <div className="compatibility-section" style={{ marginBottom: 0 }}>
            <div className="section-header">
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircleOutlineRoundedIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Compatible Nodes
                </Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 500 }}>
                {compatibility.compatible.length} matches
              </Typography>
            </div>
            <NodeList items={compatibility.compatible} label="compatible" />
          </div>
        </DialogContent>

        <DialogActions sx={{ p: 2, px: 3, borderTop: `1px solid ${theme.vars.palette.grey[900]}` }}>
          <Button
            onClick={onClose}
            variant="contained"
            disableElevation
            sx={{
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 600,
              px: 3
            }}
          >
            Got it
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
};

export default ModelCompatibilityDialog;

