/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback, useState } from "react";
import {
  Box,
  Typography,
  Tooltip,
  Button,
  Menu,
  MenuItem,
  Divider,
  CircularProgress,
  Link
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LaunchIcon from "@mui/icons-material/Launch";
import { CloseButton } from "../ui_primitives";
import { useReactFlow } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";
import {
  formatFalUnitPricingShort,
  formatFalUnitPricingTooltip,
} from "../../utils/formatFalUnitPricing";
import type { FalUnitPricing } from "../../stores/ApiTypes";
import {
  FAL_DASHBOARD_KEYS_URL,
  falCreditsDetailSuggestsKeysLink,
  fetchFalCredits,
  formatCredits,
  type FalCredits
} from "../../utils/falCredits";

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

interface NodeInfo {
  id: string;
  label: string;
  type: string;
  namespace: string;
  description: string | undefined;
  falUnitPricing: FalUnitPricing | null | undefined;
  position: { x: number; y: number };
  hasError: boolean;
  errorMessage: string | undefined;
  executionStatus: "pending" | "running" | "completed" | "error" | undefined;
}

const styles = (theme: Theme) =>
  css({
    "&.node-info-panel": {
      position: "fixed",
      top: "80px",
      right: "50px",
      width: "320px",
      maxHeight: "calc(100vh - 150px)",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
      "& @keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateX(20px)" },
        "100%": { opacity: 1, transform: "translateX(0)" }
      }
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .node-name": {
      fontSize: "16px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      wordBreak: "break-word",
      marginBottom: "4px"
    },
    "& .node-description": {
      fontSize: "13px",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.5,
      marginTop: "8px"
    },
    "& .node-tags": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      marginTop: "8px"
    },
    "& .node-tags span": {
      fontWeight: 500,
      fontSize: "10px",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      padding: "2px 6px",
      textTransform: "uppercase",
      display: "inline-block",
      cursor: "pointer",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.primary.main
      }
    },
    "& .node-use-cases": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.5,
      marginTop: "8px",
      "& h5": {
        fontSize: "11px",
        fontWeight: 600,
        color: theme.vars.palette.text.primary,
        marginBottom: "4px",
        textTransform: "uppercase"
      },
      "& ul": {
        margin: 0,
        paddingLeft: "1em",
        "& li": {
          marginBottom: "2px"
        }
      }
    },
    "& .error-message": {
      marginTop: "8px",
      padding: "8px 10px",
      backgroundColor: `${theme.vars.palette.error.main}15`,
      borderRadius: "8px",
      borderLeft: `3px solid ${theme.vars.palette.error.main}`
    },
    "& .error-text": {
      fontSize: "12px",
      color: theme.vars.palette.error.main,
      lineHeight: 1.4
    },
    "& .position-text": {
      fontSize: "11px",
      color: theme.vars.palette.text.disabled,
      fontFamily: "monospace",
      marginTop: "8px"
    },
    "& .namespace-button": {
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
    },
    "& .fal-pricing-button": {
      display: "block",
      marginTop: "6px",
      marginLeft: "-4px",
      marginRight: "-4px",
      padding: "2px 8px",
      borderRadius: "4px",
      backgroundColor: "transparent",
      color: theme.vars.palette.success.main,
      fontSize: "9px",
      textAlign: "left",
      fontWeight: 600,
      letterSpacing: "0.02em",
      textTransform: "none",
      "&:hover": {
        backgroundColor: `${theme.vars.palette.success.main}18`,
      },
    },
    "& .action-button": {
      flex: 1,
      minWidth: "80px",
      fontSize: "12px",
      padding: "6px 10px",
      borderRadius: "6px",
      marginTop: "12px",
      "& .MuiButton-startIcon": {
        marginRight: "4px"
      }
    }
  });

const NodeInfoPanel: React.FC = memo(() => {
  const theme = useTheme();
  const { getNode, setCenter } = useReactFlow();
  const inspectedNodeId = useInspectedNodeStore((state) => state.inspectedNodeId);
  const setInspectedNodeId = useInspectedNodeStore((state) => state.setInspectedNodeId);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const [falMenuAnchor, setFalMenuAnchor] = useState<HTMLElement | null>(null);
  const [falCreditsLoading, setFalCreditsLoading] = useState(false);
  const [falCreditsData, setFalCreditsData] = useState<FalCredits | null | "error">(null);
  const falMenuOpen = Boolean(falMenuAnchor);

  const handleFalPricingClick = useCallback(async (event: React.MouseEvent<HTMLElement>) => {
    setFalMenuAnchor(event.currentTarget);
    setFalCreditsLoading(true);
    setFalCreditsData(null);
    const result = await fetchFalCredits();
    setFalCreditsLoading(false);
    setFalCreditsData(result ?? "error");
  }, []);

  const handleFalMenuClose = useCallback(() => {
    setFalMenuAnchor(null);
  }, []);

  const nodeInfo = useMemo((): NodeInfo | null => {
    if (!inspectedNodeId) {
      return null;
    }
    const node = getNode(inspectedNodeId);
    if (!node) {
      return null;
    }

    const nodeType = node.type || "unknown";
    const metadata = getMetadata(nodeType);

    return {
      id: node.id,
      label: metadata?.title || "",
      type: nodeType,
      namespace: metadata?.namespace || "",
      description: metadata?.description || undefined,
      falUnitPricing: metadata?.fal_unit_pricing,
      position: node.position,
      hasError: (node.data.hasError as boolean) || false,
      errorMessage: node.data.errorMessage as string | undefined,
      executionStatus: node.data.executionStatus as "pending" | "running" | "completed" | "error" | undefined
    };
  }, [getNode, inspectedNodeId, getMetadata]);

  const parsedDescription = useMemo(() => {
    if (!nodeInfo?.description) {
      return null;
    }
    return formatNodeDocumentation(nodeInfo.description);
  }, [nodeInfo?.description]);

  const handleClose = useCallback(() => {
    setInspectedNodeId(null);
  }, [setInspectedNodeId]);

  const handleNamespaceClick = useCallback(() => {
    if (!nodeInfo) {
      return;
    }
    useNodeMenuStore.getState().openNodeMenu({
      x: 500,
      y: 200,
      dropType: nodeInfo.namespace,
      selectedPath: nodeInfo.namespace.split(".")
    });
  }, [nodeInfo]);

  const handleTagClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const tag = event.currentTarget.dataset.tag;
    if (!tag) {
      return;
    }
    useNodeMenuStore.getState().openNodeMenu({
      x: 500,
      y: 200
    });
    useNodeMenuStore.getState().setSearchTerm(tag.trim());
  }, []);

  const handleFocusClick = useCallback(() => {
    if (!nodeInfo) {
      return;
    }
    setCenter(nodeInfo.position.x, nodeInfo.position.y, { zoom: 1.5, duration: 300 });
  }, [nodeInfo, setCenter]);

  if (!nodeInfo) {
    return null;
  }

  return (
    <Box className="node-info-panel" css={styles(theme)}>
      <Box className="panel-content">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography className="node-name">{nodeInfo.label}</Typography>
          <CloseButton
            onClick={handleClose}
            sx={{ color: "text.secondary" }}
            nodrag={false}
          />
        </Box>

        <Tooltip
          title={
            <span>
              <Typography
                component="span"
                sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
              >
                {nodeInfo.namespace}
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
            onClick={handleNamespaceClick}
          >
            <PrettyNamespace namespace={nodeInfo.namespace} />
          </Button>
        </Tooltip>

        {nodeInfo.falUnitPricing && (
          <>
            <Button
              tabIndex={1}
              className="fal-pricing-button"
              onClick={handleFalPricingClick}
              aria-haspopup="true"
              aria-expanded={falMenuOpen}
            >
              FAL {formatFalUnitPricingShort(nodeInfo.falUnitPricing)}
            </Button>
            <Menu
              anchorEl={falMenuAnchor}
              open={falMenuOpen}
              onClose={handleFalMenuClose}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
              slotProps={{
                paper: {
                  sx: {
                    minWidth: 220,
                    fontSize: "12px",
                    "& .MuiMenuItem-root": { fontSize: "12px" }
                  }
                }
              }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography sx={{ fontSize: "11px", fontWeight: 600, color: "success.main", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  FAL Pricing
                </Typography>
                <Typography sx={{ fontSize: "12px", mt: 0.5, whiteSpace: "pre-line", color: "text.secondary" }}>
                  {formatFalUnitPricingTooltip(nodeInfo.falUnitPricing)}
                </Typography>
              </Box>
              <Divider />
              <Box sx={{ px: 2, py: 1 }}>
                <Typography sx={{ fontSize: "11px", fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Account Credits
                </Typography>
                {falCreditsLoading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                    <CircularProgress size={12} />
                    <Typography sx={{ fontSize: "12px", color: "text.secondary" }}>Loading…</Typography>
                  </Box>
                ) : falCreditsData === "error" || falCreditsData === null ? (
                  <Typography sx={{ fontSize: "12px", color: "text.disabled", mt: 0.5 }}>
                    {falCreditsData === "error" ? "Could not load credits" : "—"}
                  </Typography>
                ) : falCreditsData.unavailable ? (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography
                      sx={{
                        fontSize: "12px",
                        color: "warning.main",
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                      }}
                    >
                      {falCreditsData.detail ?? "Credits unavailable"}
                    </Typography>
                    {falCreditsDetailSuggestsKeysLink(falCreditsData.detail) && (
                      <Link
                        href={FAL_DASHBOARD_KEYS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFalMenuClose();
                        }}
                        sx={{
                          fontSize: "12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                          mt: 1,
                          fontWeight: 600,
                        }}
                      >
                        fal.ai API keys
                        <LaunchIcon sx={{ fontSize: 14 }} />
                      </Link>
                    )}
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: "13px", fontWeight: 600, color: "success.main", mt: 0.5 }}>
                    {formatCredits(falCreditsData)} remaining
                  </Typography>
                )}
              </Box>
              <Divider />
              <MenuItem
                component="a"
                href={`https://fal.ai/models/${nodeInfo.falUnitPricing.endpoint_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleFalMenuClose}
                sx={{ gap: 1, fontSize: "12px" }}
              >
                <LaunchIcon sx={{ fontSize: 14 }} />
                View on fal.ai
              </MenuItem>
            </Menu>
          </>
        )}

        {parsedDescription && (
          <>
            <Typography className="node-description">
              {parsedDescription.description}
            </Typography>
            {parsedDescription.tags.length > 0 && (
              <div className="node-tags">
                {parsedDescription.tags.map((tag) => (
                  <span
                    key={tag}
                    data-tag={tag}
                    onClick={handleTagClick}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {parsedDescription.useCases.raw && (
              <div className="node-use-cases">
                <h5>Use cases</h5>
                <ul>
                  {parsedDescription.useCases.raw.split("\n").map((useCase) => (
                    <li key={useCase}>{useCase}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {nodeInfo.hasError && (
          <Box className="error-message">
            <Typography className="error-text">{nodeInfo.errorMessage}</Typography>
          </Box>
        )}

        <Button
          className="action-button"
          size="small"
          startIcon={<OpenInNewIcon fontSize="small" />}
          onClick={handleFocusClick}
        >
          Focus
        </Button>
      </Box>
    </Box >
  );
});

NodeInfoPanel.displayName = "NodeInfoPanel";

export default NodeInfoPanel;
