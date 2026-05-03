/** @jsxImportSource @emotion/react */
import { memo, useCallback, forwardRef, useState, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Collapse } from "@mui/material";
import { Text } from "../ui_primitives";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";
import { colorForType, IconForType } from "../../config/data_types";
import { HighlightText } from "../ui_primitives/HighlightText";
import { getProviderKindForNamespace } from "../../utils/nodeProvider";

interface SearchResultItemProps {
  node: NodeMetadata;
  onDragStart: (
    node: NodeMetadata,
    event: React.DragEvent<HTMLDivElement>
  ) => void;
  onDragEnd?: () => void;
  onClick: (node: NodeMetadata) => void;
  isKeyboardSelected?: boolean;
}

const MAX_DESCRIPTION_LENGTH = 120;

const searchResultStyles = (theme: Theme) =>
  css({
    "&.search-result-item": {
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(2.5, 3),
      margin: theme.spacing(0.5, 0),
      borderRadius: "var(--rounded-md)",
      cursor: "pointer",
      transition: "all 0.15s ease",
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
        fontSize: "0.95rem",
        fontWeight: 400,
        color: theme.vars.palette.text.primary,
        lineHeight: 1.3,
        "& .highlight": {
          color: "var(--palette-primary-main)"
        }
      },
      ".result-namespace": {
        fontSize: "0.7rem",
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        "& .highlight": {
          color: "var(--palette-primary-main)"
        }
      },
      ".result-description": {
        fontSize: "0.8rem",
        color: theme.vars.palette.text.secondary,
        lineHeight: 1.4,
        marginTop: theme.spacing(1),
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
        borderRadius: "var(--rounded-sm)",
        color: theme.vars.palette.text.secondary,
        transition: "transform 0.2s ease, color 0.2s ease",
        "&.expanded": {
          transform: "rotate(180deg)",
          color: "var(--palette-primary-main)"
        },
        "& svg": {
          fontSize: "16px"
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
        fontSize: "0.65rem",
        padding: theme.spacing(0.5, 1.5),
        borderRadius: "var(--rounded-lg)",
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.secondary,
        letterSpacing: "0.3px"
      },
      ".provider-tag": {
        fontSize: "0.6rem",
        padding: "1px 5px",
        borderRadius: "var(--rounded-md)",
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
        padding: theme.spacing(0, 3, 2.5, 3)
      },
      ".io-info": {
        padding: theme.spacing(2),
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: "0 0 6px 6px",
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing(1),
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
      },
      ".io-row": {
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(2),
        fontSize: "0.7rem"
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
        gap: theme.spacing(0.75)
      },
      ".io-item": {
        padding: theme.spacing(0.25, 1.25),
        borderRadius: "3px",
        fontSize: "0.65rem",
        borderLeft: "2px solid",
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

const SearchResultItem = memo(
  forwardRef<HTMLDivElement, SearchResultItemProps>(
    (
      { node, onDragStart, onDragEnd, onClick, isKeyboardSelected = false },
      ref
    ) => {
      const theme = useTheme();
      const outputType =
        node.outputs.length > 0 ? node.outputs[0].type.type : "";
      const providerKind = getProviderKindForNamespace(node.namespace);
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);

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

      // Truncate description if too long - memoize
      const truncatedDescription = useMemo(
        () =>
          description.length > MAX_DESCRIPTION_LENGTH
            ? description.substring(0, MAX_DESCRIPTION_LENGTH) + "..."
            : description,
        [description]
      );

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

      return (
        <div
          ref={ref}
          className={`search-result-item ${isExpanded ? "expanded" : ""} ${isKeyboardSelected ? "keyboard-selected" : ""}`}
          css={searchResultStyles(theme)}
          draggable
          onClick={handleClick}
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
                    borderRadius: "0 0 3px 0",
                    marginLeft: "0",
                    marginTop: "0"
                  }}
                  bgStyle={{
                    backgroundColor: theme.vars.palette.grey[900],
                    margin: "0",
                    padding: "1px",
                    borderRadius: "0 0 3px 0",
                    boxShadow: `inset 1px 1px 2px ${theme.vars.palette.action.disabledBackground}`,
                    width: "20px",
                    height: "20px"
                  }}
                  svgProps={{
                    width: "15px",
                    height: "15px"
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
              <div
                className={`expand-indicator ${isExpanded ? "expanded" : ""}`}
                onClick={handleToggleExpand}
                title={isExpanded ? "Collapse details" : "Show details"}
              >
                <ExpandMoreIcon />
              </div>
            </div>
          </div>

          {truncatedDescription && (
            <Text className="result-description" component="div">
              <HighlightText
                text={truncatedDescription}
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
