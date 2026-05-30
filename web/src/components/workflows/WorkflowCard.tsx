/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Fade } from "@mui/material";
import { Text, Tooltip, LoadingSpinner, Box } from "../ui_primitives";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";

import { Workflow } from "../../stores/ApiTypes";
import { BASE_URL } from "../../stores/BASE_URL";
import { getNodeDisplayName, getNodeNamespace } from "../../utils/nodeDisplay";

interface WorkflowCardProps {
  workflow: Workflow;
  matchedNodes: { text: string }[];
  nodesOnlySearch: boolean;
  isLoading: boolean;
  onClick: (workflow: Workflow) => void;
  /** Category accent; when set, tints the thumbnail to colour-code the card. */
  tint?: string;
  /** Category label; when set (with `tint`), shown as a colored pill leading
   *  the tag list. */
  categoryLabel?: string;
  /** Tags to drop from the chip row (e.g. the category's own tags, which the
   *  category pill already conveys). Case-insensitive. */
  hideTags?: string[];
  /** Cap on the number of plain tag chips shown after the category pill. */
  maxChips?: number;
  /** Description line clamp (default 3). */
  descriptionLines?: number;
}

const HIDDEN_TAGS = new Set([
  "start",
  "getting-started",
  "example",
  "ai",
  "agent",
  "agents"
]);

const cardStyles = (theme: Theme) =>
  css({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: "260px",
    borderRadius: "var(--rounded-xl)",
    overflow: "hidden",
    cursor: "pointer",
    background: theme.vars.palette.grey[900],
    border: `1px solid ${theme.vars.palette.grey[800]}`,
    transition:
      "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
    "&:hover": {
      transform: "translateY(-2px)",
      borderColor: theme.vars.palette.primary.main,
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)"
    },
    "&:hover .matched-nodes": {
      display: "flex"
    },
    "&.loading": {
      cursor: "wait",
      pointerEvents: "none"
    },
    ".loading-overlay": {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      zIndex: 10,
      borderRadius: "var(--rounded-xl)"
    },
    ".loading-text": {
      color: theme.vars.palette.primary.main,
      fontSize: "15px",
      marginTop: "12px",
      textAlign: "center",
      fontWeight: 500
    },
    ".card-image-container": {
      position: "relative",
      width: "100%",
      aspectRatio: "16 / 9",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[850],
      flexShrink: 0
    },
    ".card-image": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transition: "transform 0.3s ease"
    },
    "&:hover .card-image": {
      transform: "scale(1.03)"
    },
    ".card-tint": {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      transition: "opacity 0.2s ease"
    },
    "&:hover .card-tint": {
      opacity: 0.85
    },
    ".package-badge": {
      position: "absolute",
      top: "8px",
      right: "8px",
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.5px",
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(4px)",
      color: theme.vars.palette.grey[200],
      padding: "4px 8px",
      borderRadius: "var(--rounded-md)",
      textTransform: "uppercase"
    },
    ".matched-nodes": {
      position: "absolute",
      top: "8px",
      left: "8px",
      display: "none",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "calc(100% - 80px)",
      zIndex: 5
    },
    ".matched-item": {
      fontSize: "11px",
      fontWeight: 600,
      padding: "4px 8px",
      borderRadius: "var(--rounded-md)",
      backgroundColor: theme.vars.palette.grey[100],
      color: theme.vars.palette.grey[900]
    },
    ".matched-item-name": {
      display: "block",
      fontSize: "13px",
      color: theme.vars.palette.grey[900]
    },
    ".matched-item-namespace": {
      display: "block",
      fontSize: "11px",
      color: theme.vars.palette.grey[700],
      fontWeight: 500
    },
    ".card-content": {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      padding: "10px 12px 12px",
      flex: 1,
      minHeight: 0
    },
    ".card-title": {
      fontSize: "15px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      lineHeight: 1.25,
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      // Lock to one line of height so the flex parent can't clip the
      // descender of the line and swallow the ellipsis.
      maxHeight: "calc(0.9rem * 1.25)",
      margin: 0
    },
    ".card-description": {
      fontSize: "13px",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.4,
      display: "-webkit-box",
      WebkitLineClamp: 3,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      // Lock the visible description to N full lines so the parent flex
      // container can't shave the bottom of the last line.
      maxHeight: "calc(0.75rem * 1.4 * 3)",
      margin: 0
    },
    ".chips-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      marginTop: "auto",
      paddingTop: "6px"
    },
    ".chip": {
      fontSize: "11px",
      fontWeight: 500,
      letterSpacing: "0.3px",
      padding: "2px 8px",
      borderRadius: "999px",
      color: theme.vars.palette.text.secondary,
      background: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      textTransform: "lowercase"
    },
    ".chip-category": {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      textTransform: "none",
      fontWeight: 600
    },
    ".chip-dot": {
      width: "6px",
      height: "6px",
      borderRadius: "999px",
      flexShrink: 0
    }
  });

const WorkflowCard = ({
  workflow,
  matchedNodes,
  nodesOnlySearch,
  isLoading,
  onClick,
  tint,
  categoryLabel,
  hideTags,
  maxChips = 3,
  descriptionLines = 3
}: WorkflowCardProps) => {
  const theme = useTheme();

  const handleClick = useCallback(() => {
    onClick(workflow);
  }, [onClick, workflow]);

  const imageUrl = useMemo(() => {
    // Prefer the server-provided URL — it carries an md5-based ?v=<hash>
    // cache buster so updates show up without users having to hard-refresh.
    if (workflow.thumbnail_url) {
      return workflow.thumbnail_url.startsWith("http")
        ? workflow.thumbnail_url
        : `${BASE_URL}${workflow.thumbnail_url}`;
    }
    return `${BASE_URL}/api/assets/packages/${workflow.package_name}/${workflow.name}.jpg`;
  }, [workflow.thumbnail_url, workflow.package_name, workflow.name]);

  // Hide the package badge for the default base package — it's noise when
  // every card carries it. Surface only differentiating signals.
  const packageBadge = useMemo(() => {
    const pkg = workflow.package_name;
    if (!pkg || pkg === "nodetool-base") {
      return null;
    }
    return pkg.replace("nodetool-", "");
  }, [workflow.package_name]);

  const chips = useMemo(() => {
    const hidden = new Set(hideTags?.map((t) => t.toLowerCase()));
    const tags = (workflow.tags || []).filter((t) => {
      const lower = t.toLowerCase();
      return !HIDDEN_TAGS.has(lower) && !hidden.has(lower);
    });
    return tags.slice(0, Math.max(0, maxChips));
  }, [workflow.tags, hideTags, maxChips]);

  return (
    <Tooltip
      title={workflow.description || ""}
      placement="top"
      arrow
      delay={500}
      leaveDelay={0}
      slotProps={{
        tooltip: {
          sx: {
            backgroundColor: theme.vars.palette.grey[800],
            color: theme.vars.palette.text.primary,
            fontSize: "15px",
            padding: "10px 14px",
            maxWidth: 300,
            borderRadius: "var(--rounded-lg)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)"
          }
        },
        arrow: {
          sx: {
            color: theme.vars.palette.grey[800]
          }
        }
      }}
    >
      <Box
        css={cardStyles(theme)}
        className={isLoading ? "loading" : ""}
        onClick={handleClick}
      >
        {isLoading && (
          <Fade in={true}>
            <Box className="loading-overlay">
              <LoadingSpinner size="medium" />
              <Text className="loading-text">Creating workflow…</Text>
            </Box>
          </Fade>
        )}

        <Box className="card-image-container">
          <img
            className="card-image"
            src={imageUrl}
            alt={workflow.name}
            loading="lazy"
          />
          {tint && (
            <div
              className="card-tint"
              style={{
                background: `linear-gradient(180deg, ${tint}14 0%, ${tint}38 100%)`
              }}
            />
          )}
          {packageBadge && (
            <Text className="package-badge">{packageBadge}</Text>
          )}
          {nodesOnlySearch && matchedNodes.length > 0 && (
            <Box className="matched-nodes">
              {matchedNodes.slice(0, 3).map((match) => (
                <Text key={match.text} className="matched-item">
                  {getNodeDisplayName(match.text) && (
                    <span className="matched-item-name">
                      {getNodeDisplayName(match.text)}
                    </span>
                  )}
                  <span className="matched-item-namespace">
                    {getNodeNamespace(match.text)}
                  </span>
                </Text>
              ))}
              {matchedNodes.length > 3 && (
                <Text className="matched-item">
                  +{matchedNodes.length - 3} more
                </Text>
              )}
            </Box>
          )}
        </Box>

        <Box className="card-content">
          <Text component="h3" className="card-title">
            {workflow.name}
          </Text>
          {workflow.description && (
            <Text
              className="card-description"
              style={{
                WebkitLineClamp: descriptionLines,
                maxHeight: `calc(0.75rem * 1.4 * ${descriptionLines})`
              }}
            >
              {workflow.description}
            </Text>
          )}
          {(categoryLabel && tint) || chips.length > 0 ? (
            <Box className="chips-container">
              {categoryLabel && tint && (
                <span
                  className="chip chip-category"
                  style={{
                    background: `${tint}24`,
                    borderColor: `${tint}73`,
                    color: tint
                  }}
                >
                  <span
                    className="chip-dot"
                    style={{ background: tint }}
                  />
                  {categoryLabel}
                </span>
              )}
              {chips.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </Box>
          ) : null}
        </Box>
      </Box>
    </Tooltip>
  );
};

export default memo(WorkflowCard);
