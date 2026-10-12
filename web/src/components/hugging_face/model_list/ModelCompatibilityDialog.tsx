/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import {
  Dialog,
  Text,
  Caption,
  Chip,
  FlexRow,
  FlexColumn,
  CopyButton,
  MOTION,
  BORDER_RADIUS,
  SPACING
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

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const styles = (theme: Theme) =>
  css({
    "& .compatibility-section": {
      marginBottom: theme.spacing(3),
      animation: `${fadeIn} ${MOTION.slow} forwards`
    },
    "& .section-header": {
      justifyContent: "space-between",
      marginBottom: theme.spacing(1.5)
    },
    "& .node-list": {
      maxHeight: 340,
      overflowY: "auto",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.xs,
      background: theme.vars.palette.action.hover,
      "&::-webkit-scrollbar": {
        width: 6
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.action.disabledBackground,
        borderRadius: BORDER_RADIUS.xs
      }
    },
    "& .node-list-item": {
      padding: theme.spacing(1.5, 2),
      transition: MOTION.all,
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
      background:
        "linear-gradient(90deg, rgba(var(--palette-primary-mainChannel) / 0.07) 0%, transparent 100%)"
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
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    "& .node-type": {
      fontFamily: "var(--fontFamilyMono)",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      gap: theme.spacing(0.5),
      opacity: 0.8
    },
    "& .property-chip": {
      height: 20,
      fontSize: "var(--fontSizeSmaller)",
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
      borderRadius: BORDER_RADIUS.md,
      border: `1px dashed ${theme.vars.palette.divider}`
    },
    "& .copy-button": {
      opacity: 0,
      transition: `opacity ${MOTION.normal}`
    }
  });

const NodeList: React.FC<{
  items: NodeCompatibilityInfo[];
  label: string;
  isRecommended?: boolean;
}> = ({ items, label, isRecommended }) => {
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
          <FlexRow
            justify="space-between"
            align="center"
            fullWidth
            className="node-row"
          >
            <FlexColumn className="node-info">
              <FlexRow align="center" className="node-title-row">
                <Text className="node-title" title={node.title}>
                  {node.title}
                </Text>
                {isRecommended && (
                  <Chip
                    label="Best match"
                    compact
                    color="primary"
                    variant="outlined"
                  />
                )}
              </FlexRow>
              <FlexRow align="center" className="node-type">
                <TerminalRoundedIcon fontSize="inherit" />
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
      title="Node compatibility"
    >
      <div css={styles(theme)}>
        <FlexColumn gap={SPACING.lg}>
          <Caption
            className="model-id"
            sx={{
              alignSelf: "flex-start",
              fontFamily: "var(--fontFamilyMono)",
              color: "text.secondary",
              background: theme.vars.palette.action.hover,
              px: SPACING.xs,
              py: SPACING.micro,
              borderRadius: BORDER_RADIUS.xs,
              border: `1px solid ${theme.vars.palette.divider}`
            }}
          >
            {model.repo_id || model.name}
          </Caption>

          <FlexColumn className="compatibility-section" gap={SPACING.xs}>
            <FlexRow
              justify="space-between"
              align="center"
              className="section-header"
              fullWidth
            >
              <FlexRow gap={SPACING.xs} align="center">
                <VerifiedRoundedIcon
                  fontSize="small"
                  sx={{ color: "primary.main" }}
                />
                <Text size="small" weight={600} sx={{ color: "primary.main" }}>
                  Recommended nodes
                </Text>
              </FlexRow>
              <Caption color="secondary">
                {compatibility.recommended.length} matches
              </Caption>
            </FlexRow>
            <NodeList
              items={compatibility.recommended}
              label="recommended"
              isRecommended
            />
          </FlexColumn>

          <FlexColumn
            className="compatibility-section"
            gap={SPACING.xs}
            sx={{ mb: SPACING.none }}
          >
            <FlexRow
              justify="space-between"
              align="center"
              className="section-header"
              fullWidth
            >
              <FlexRow gap={SPACING.xs} align="center">
                <CheckCircleOutlineRoundedIcon
                  fontSize="small"
                  sx={{ color: "text.secondary" }}
                />
                <Text size="small" weight={600}>
                  Compatible nodes
                </Text>
              </FlexRow>
              <Caption color="secondary">
                {compatibility.compatible.length} matches
              </Caption>
            </FlexRow>
            <NodeList items={compatibility.compatible} label="compatible" />
          </FlexColumn>
        </FlexColumn>
      </div>
    </Dialog>
  );
};

export default ModelCompatibilityDialog;
