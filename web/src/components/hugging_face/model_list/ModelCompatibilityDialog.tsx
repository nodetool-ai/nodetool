/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import {
  Dialog,
  CloseButton,
  Text,
  Caption,
  Chip,
  FlexRow,
  FlexColumn,
  EditorButton,
  CopyButton
} from "../../ui_primitives";
import type { Theme } from "@mui/material/styles";
import React from "react";
import type {
  ModelCompatibilityResult,
  NodeCompatibilityInfo
} from "./useModelCompatibility";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
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
      justifyContent: "space-between",
      marginBottom: theme.spacing(1.5)
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
      gap: theme.spacing(1.5)
    },
    "& .node-info": {
      flex: 1,
      minWidth: 0,
      gap: theme.spacing(0.5)
    },
    "& .node-title-row": {
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
      gap: theme.spacing(1),
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
      <Text size="small" className="empty-state">
        No {label.toLowerCase()} nodes found for this model type.
      </Text>
    );
  }

  return (
    <FlexColumn className="node-list" sx={{ p: 0 }}>
      {items.map((node, index) => (
        <FlexColumn
          key={node.nodeType}
          className={`node-list-item ${isRecommended ? "recommended-item" : ""}`}
          sx={{ animationDelay: `${index * 0.05}s` }}
        >
          <FlexRow justify="space-between" align="center" fullWidth className="node-row">
            <FlexColumn className="node-info">
              <FlexRow align="center" className="node-title-row">
                <Text className="node-title" title={node.title}>
                  {node.title}
                </Text>
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
              </FlexRow>
              <FlexRow align="center" className="node-type">
                <TerminalRoundedIcon sx={{ fontSize: 12 }} />
                {node.nodeType}
              </FlexRow>
              {node.propertyNames.length > 0 && (
                <FlexRow className="node-meta" wrap>
                  {node.propertyNames.map((name) => (
                    <Chip
                      key={name}
                      size="small"
                      label={name}
                      className="property-chip"
                      variant="outlined"
                    />
                  ))}
                </FlexRow>
              )}
            </FlexColumn>
            <div className="copy-button">
              <CopyButton
                value={node.nodeType}
                tooltip="Copy node type"
                tooltipPlacement="left"
              />
            </div>
          </FlexRow>
        </FlexColumn>
      ))}
    </FlexColumn>
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
      title={
        <FlexRow justify="space-between" align="flex-start" fullWidth>
          <FlexColumn gap={0.5}>
            <FlexRow gap={1} align="center">
              <AutoAwesomeRoundedIcon sx={{ color: "primary.main", fontSize: 20 }} />
              <Text size="normal" weight={600} component="span" sx={{ letterSpacing: -0.2 }}>
                Node Compatibility
              </Text>
            </FlexRow>
            <Caption
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
            </Caption>
          </FlexColumn>
          <CloseButton onClick={onClose} sx={{ color: "text.disabled", "&:hover": { color: "text.primary" } }} />
        </FlexRow>
      }
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
        <FlexColumn gap={2.5} sx={{ p: 3, pt: 0 }}>
          <FlexColumn className="compatibility-section" gap={1}>
            <FlexRow justify="space-between" align="center" className="section-header" fullWidth>
              <FlexRow gap={1} align="center">
                <VerifiedRoundedIcon sx={{ color: "primary.main", fontSize: 18 }} />
                <Text size="small" weight={600} sx={{ color: "primary.main" }}>
                  Recommended Nodes
                </Text>
              </FlexRow>
              <Caption sx={{ color: "text.disabled", fontWeight: 500 }}>
                {compatibility.recommended.length} matches
              </Caption>
            </FlexRow>
            <NodeList items={compatibility.recommended} label="recommended" isRecommended />
          </FlexColumn>

          <FlexColumn className="compatibility-section" gap={1} sx={{ mb: 0 }}>
            <FlexRow justify="space-between" align="center" className="section-header" fullWidth>
              <FlexRow gap={1} align="center">
                <CheckCircleOutlineRoundedIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                <Text size="small" weight={600}>
                  Compatible Nodes
                </Text>
              </FlexRow>
              <Caption sx={{ color: "text.disabled", fontWeight: 500 }}>
                {compatibility.compatible.length} matches
              </Caption>
            </FlexRow>
            <NodeList items={compatibility.compatible} label="compatible" />
          </FlexColumn>

          <FlexRow justify="flex-end" sx={{ pt: 1.5, borderTop: `1px solid ${theme.vars.palette.grey[900]}` }}>
            <EditorButton onClick={onClose} variant="contained" density="compact" sx={{ borderRadius: 2, fontWeight: 600, px: 3 }}>
              Got it
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      </div>
    </Dialog>
  );
};

export default ModelCompatibilityDialog;
