/** @jsxImportSource @emotion/react */
import { memo, useCallback, forwardRef, useState, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Box, Collapse, MOTION, BORDER_RADIUS, FONT_WEIGHT } from "../ui_primitives";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";
import { colorForType } from "../../config/data_types";
import { IconForType } from "../../config/IconForType";
import { HighlightText } from "../ui_primitives/HighlightText";
import { getProviderKindForNamespace } from "../../utils/nodeProvider";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import FavoriteButton from "../ui_primitives/FavoriteButton";
import { NOTIFICATION_TIMEOUT_SHORT } from "../../config/constants";

interface SearchResultItemProps {
  node: NodeMetadata;
  onDragStart: (
    node: NodeMetadata,
    event: React.DragEvent<HTMLDivElement>
  ) => void;
  onDragEnd?: () => void;
  onClick: (node: NodeMetadata) => void;
  isKeyboardSelected?: boolean;
  /**
   * Compact mode: single-line title-only row, no description / tags /
   * expandable I/O details. Used by the left-panel sidebar where horizontal
   * space is narrow (~280 px). Default false.
   */
  compact?: boolean;
}

const searchResultStyles = (theme: Theme, compact: boolean) =>
  css({
    "&.search-result-item": {
      display: "flex",
      flexDirection: compact ? "row" : "column",
      alignItems: compact ? "center" : "stretch",
      gap: compact ? theme.spacing(1) : 0,
      padding: compact ? theme.spacing(1, 1) : theme.spacing(3, 3),
      margin: compact ? theme.spacing(0.5, 0) : theme.spacing(0.5, 0),
      borderRadius: "var(--rounded-md)",
      cursor: "pointer",
      transition: MOTION.all,
      border: "1px solid transparent",
      backgroundColor: "transparent",
      position: "relative",
      zIndex: 1,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        border: `1px solid ${theme.vars.palette.divider}`
      },
      "&.expanded": {
        backgroundColor: theme.vars.palette.action.hover,
        border: `1px solid ${theme.vars.palette.divider}`,
        zIndex: 10
      },
      "&.keyboard-selected": {
        backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
        border: `1px solid rgba(var(--palette-primary-mainChannel) / 0.4)`,
        boxShadow: "0 0 0 2px rgba(var(--palette-primary-mainChannel) / 0.1)"
      },
      ".result-header": {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: theme.spacing(2)
      },
      ".result-header-right": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(1.5)
      },
      ".result-main": {
        flex: 1,
        minWidth: 0
      },
      ".result-title-row": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(2)
      },
      ".result-title": {
        fontSize: "var(--fontSizeNormal)",
        fontWeight: FONT_WEIGHT.normal,
        color: theme.vars.palette.text.primary,
        lineHeight: 1.3,
        "& .highlight": {
          color: "var(--palette-primary-main)"
        }
      },
      ".result-namespace": {
        fontFamily: theme.fontFamily2,
        fontSize: "var(--fontSizeSmaller)",
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        "& .highlight": {
          color: "var(--palette-primary-main)"
        }
      },
      ".result-description": {
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.text.secondary,
        lineHeight: 1.4,
        marginTop: theme.spacing(1),
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        "& .highlight": {
          color: "var(--palette-primary-main)"
        }
      },
      ".expand-indicator": {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "20px",
        height: "20px",
        borderRadius: BORDER_RADIUS.sm,
        color: theme.vars.palette.text.secondary,
        transition: `${MOTION.transform}, color ${MOTION.fast}`,
        "&.expanded": {
          transform: "rotate(180deg)",
          color: "var(--palette-primary-main)"
        },
        "& svg": {
          fontSize: "var(--fontSizeNormal)"
        }
      },
      ".matched-tags-inline": {
        display: "flex",
        gap: theme.spacing(1),
        marginLeft: theme.spacing(1)
      },
      ".result-tags": {
        display: "flex",
        flexWrap: "wrap",
        gap: theme.spacing(1),
        marginTop: theme.spacing(1.5)
      },
      ".result-tag": {
        fontSize: "var(--fontSizeSmaller)",
        padding: theme.spacing(0.5, 1.5),
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.secondary,
        letterSpacing: "0.3px"
      },
      ".provider-tag": {
        fontSize: "var(--fontSizeSmaller)",
        padding: "2px 6px",
        borderRadius: BORDER_RADIUS.md,
        letterSpacing: "0.3px",
        opacity: 1,
        border: "none"
      },
      ".io-info-wrapper": {
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        zIndex: 100,
        padding: theme.spacing(0, 3, 3, 3)
      },
      ".io-info": {
        padding: theme.spacing(2),
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: `0 0 ${BORDER_RADIUS.md} ${BORDER_RADIUS.md}`,
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing(1),
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
      },
      ".io-row": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(2),
        fontSize: "var(--fontSizeSmaller)"
      },
      ".io-label": {
        color: theme.vars.palette.text.secondary,
        minWidth: "45px",
        textTransform: "uppercase",
        letterSpacing: "0.3px"
      },
      ".io-items": {
        display: "flex",
        flexWrap: "wrap",
        gap: theme.spacing(1)
      },
      ".io-item": {
        padding: theme.spacing(0.5, 1),
        borderRadius: BORDER_RADIUS.sm,
        fontSize: "var(--fontSizeSmaller)",
        borderLeft: "2px solid",
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

const SearchResultItem = memo(
  forwardRef<HTMLDivElement, SearchResultItemProps>(
    (
      {
        node,
        onDragStart,
        onDragEnd,
        onClick,
        isKeyboardSelected = false,
        compact = false
      },
      ref
    ) => {
      const theme = useTheme();
      const outputType =
        node.outputs.length > 0 ? node.outputs[0].type.type : "";
      const providerKind = getProviderKindForNamespace(node.namespace);
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);
      const isFavorite = useFavoriteNodesStore((state) =>
        state.isFavorite(node.node_type)
      );
      const toggleFavorite = useFavoriteNodesStore(
        (state) => state.toggleFavorite
      );
      const addNotification = useNotificationStore(
        (state) => state.addNotification
      );

      const handleFavoriteToggle = useCallback(
        (next: boolean) => {
          toggleFavorite(node.node_type);
          addNotification({
            type: "info",
            content: next
              ? "Node added to favorites"
              : "Node removed from favorites",
            timeout: NOTIFICATION_TIMEOUT_SHORT
          });
        },
        [toggleFavorite, addNotification, node.node_type]
      );

      // Parse description and tags - memoize to avoid re-computation on every render
      const { description, tags } = useMemo(
        () =>
          formatNodeDocumentation(
            node.description,
            searchTerm,
            node.searchInfo
          ),
        [node.description, searchTerm, node.searchInfo]
      );

      // Find matching tags by comparing with search term - memoize
      const matchingTags = useMemo(() => {
        if (!searchTerm) {
          return [];
        }
        const searchLower = searchTerm.toLowerCase();
        return tags.filter((tag) => tag.toLowerCase().includes(searchLower));
      }, [searchTerm, tags]);

      const [isExpanded, setIsExpanded] = useState(false);

      const handleClick = useCallback(() => {
        onClick(node);
      }, [onClick, node]);

      const handleToggleExpand = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded((prev) => !prev);
      }, []);

      const handleMouseEnter = useCallback(() => {
        // No longer auto-expand on hover
      }, []);

      const handleMouseLeave = useCallback(() => {
        // No longer auto-collapse on leave
      }, []);

      const handleDragStart = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
          onDragStart(node, event);
        },
        [onDragStart, node]
      );

      if (compact) {
        return (
          <div
            ref={ref}
            className={`search-result-item ${isKeyboardSelected ? "keyboard-selected" : ""}`}
            css={searchResultStyles(theme, true)}
            role="button"
            tabIndex={0}
            draggable
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }}
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
          >
            <IconForType
              iconName={outputType}
              bgStyle={{
                backgroundColor: theme.vars.palette.grey[900],
                width: "18px",
                height: "18px",
                margin: 0,
                padding: "1px",
                borderRadius: BORDER_RADIUS.sm
              }}
              svgProps={{ width: "14px", height: "14px" }}
            />
            <Text
              className="result-title"
              component="div"
              sx={{
                flex: 1,
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              <HighlightText
                text={node.title}
                query={searchTerm}
                matchStyle="primary"
              />
            </Text>
            <span
              className="provider-tag"
              style={{
                color:
                  providerKind === "api"
                    ? theme.vars.palette.c_provider_api
                    : theme.vars.palette.c_provider_local
              }}
            >
              {providerKind === "api" ? "API" : "Local"}
            </span>
            <FavoriteButton
              isFavorite={isFavorite}
              onToggle={handleFavoriteToggle}
              buttonSize="small"
            />
          </div>
        );
      }

      return (
        <div
          ref={ref}
          className={`search-result-item ${isExpanded ? "expanded" : ""} ${isKeyboardSelected ? "keyboard-selected" : ""}`}
          css={searchResultStyles(theme, compact)}
          role="button"
          tabIndex={0}
          draggable
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleClick();
            }
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="result-header">
            <div className="result-main">
              <div className="result-title-row">
                <IconForType
                  iconName={outputType}
                  containerStyle={{
                    marginLeft: "0",
                    marginTop: "0"
                  }}
                  bgStyle={{
                    backgroundColor: theme.vars.palette.action.hover,
                    border: `1px solid ${theme.vars.palette.divider}`,
                    margin: "0",
                    padding: "4px",
                    borderRadius: BORDER_RADIUS.md,
                    width: "28px",
                    height: "28px"
                  }}
                  svgProps={{
                    width: "16px",
                    height: "16px"
                  }}
                />
                <Text className="result-title" component="div">
                  <HighlightText
                    text={node.title}
                    query={searchTerm}
                    matchStyle="primary"
                  />
                </Text>
                {matchingTags.length > 0 && (
                  <div className="matched-tags-inline">
                    {matchingTags.slice(0, 2).map((tag, idx) => (
                      <span key={`${node.node_type}-tag-${tag}-${idx}`} className="result-tag matched">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <span
                  className="provider-tag"
                  style={{
                    color:
                      providerKind === "api"
                        ? theme.vars.palette.c_provider_api
                        : theme.vars.palette.c_provider_local
                  }}
                >
                  {providerKind === "api" ? "API" : "Local"}
                </span>
              </div>
            </div>
            <div className="result-header-right">
              <Text className="result-namespace" component="div">
                <HighlightText
                  text={node.namespace}
                  query={searchTerm}
                  matchStyle="primary"
                />
              </Text>
              <FavoriteButton
                isFavorite={isFavorite}
                onToggle={handleFavoriteToggle}
                buttonSize="small"
              />
              <div
                className={`expand-indicator ${isExpanded ? "expanded" : ""}`}
                role="button"
                tabIndex={0}
                onClick={handleToggleExpand}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsExpanded((prev) => !prev);
                  }
                }}
                title={isExpanded ? "Collapse details" : "Show details"}
              >
                <ExpandMoreIcon />
              </div>
            </div>
          </div>

          {description && (
            <Text className="result-description" component="div">
              <HighlightText
                text={description}
                query={searchTerm}
                matchStyle="primary"
              />
            </Text>
          )}

          {/* Input/Output info - click to expand (absolutely positioned overlay) */}
          <Collapse in={isExpanded} timeout={150} className="io-info-wrapper">
            <Box className="io-info">
              {node.properties.length > 0 && (
                <Box className="io-row">
                  <span className="io-label">Input:</span>
                  <Box className="io-items">
                    {node.properties.slice(0, 6).map((prop) => (
                      <span
                        key={prop.name}
                        className="io-item"
                        style={{
                          borderColor: colorForType(prop.type.type)
                        }}
                      >
                        {prop.name}
                      </span>
                    ))}
                    {node.properties.length > 6 && (
                      <span className="io-item" style={{ borderColor: "#666" }}>
                        +{node.properties.length - 6}
                      </span>
                    )}
                  </Box>
                </Box>
              )}
              {node.outputs.length > 0 && (
                <Box className="io-row">
                  <span className="io-label">Output:</span>
                  <Box className="io-items">
                    {node.outputs.map((output) => (
                      <span
                        key={output.name}
                        className="io-item"
                        style={{
                          borderColor: colorForType(output.type.type)
                        }}
                      >
                        {output.type.type}
                      </span>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </div>
      );
    }
  )
);

SearchResultItem.displayName = "SearchResultItem";

export default SearchResultItem;
