/** @jsxImportSource @emotion/react */
import { memo, useCallback, forwardRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Box, Collapse } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { highlightText as highlightTextUtil } from "../../utils/highlightText";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";
import { colorForType } from "../../config/data_types";

interface SearchResultItemProps {
  node: NodeMetadata;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onClick: () => void;
}

const MAX_DESCRIPTION_LENGTH = 120;

const searchResultStyles = (theme: Theme) =>
  css({
    "&.search-result-item": {
      display: "flex",
      flexDirection: "column",
      padding: "10px 12px",
      margin: "2px 0",
      borderRadius: "6px",
      cursor: "pointer",
      transition: "all 0.15s ease",
      border: "1px solid transparent",
      backgroundColor: "transparent",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        border: `1px solid ${theme.vars.palette.divider}`
      },
      "&.expanded": {
        backgroundColor: theme.vars.palette.action.hover,
        border: `1px solid ${theme.vars.palette.divider}`
      },
      ".result-header": {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "8px"
      },
      ".result-main": {
        flex: 1,
        minWidth: 0
      },
      ".result-title-row": {
        display: "flex",
        alignItems: "center",
        gap: "8px"
      },
      ".result-title": {
        fontSize: "0.95rem",
        fontWeight: 600,
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
        marginTop: "4px",
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
        borderRadius: "4px",
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
      ".result-tags": {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        marginTop: "6px"
      },
      ".result-tag": {
        fontSize: "0.65rem",
        padding: "1px 5px",
        borderRadius: "3px",
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        border: `1px solid ${theme.vars.palette.divider}`,
        "&.matched": {
          backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.15)",
          color: "var(--palette-primary-main)",
          borderColor: "rgba(var(--palette-primary-mainChannel) / 0.3)"
        }
      },
      ".io-info": {
        marginTop: "8px",
        paddingTop: "8px",
        borderTop: `1px solid ${theme.vars.palette.divider}`,
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      },
      ".io-row": {
        display: "flex",
        alignItems: "center",
        gap: "8px",
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
        gap: "3px"
      },
      ".io-item": {
        padding: "1px 5px",
        borderRadius: "3px",
        fontSize: "0.65rem",
        borderLeft: "2px solid",
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

const SearchResultItem = memo(
  forwardRef<HTMLDivElement, SearchResultItemProps>(
    ({ node, onDragStart, onDragEnd, onClick }, ref) => {
      const theme = useTheme();
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);

      // Parse description and tags
      const { description } = formatNodeDocumentation(
        node.description,
        searchTerm,
        node.searchInfo
      );

      // Truncate description if too long
      const truncatedDescription =
        description.length > MAX_DESCRIPTION_LENGTH
          ? description.substring(0, MAX_DESCRIPTION_LENGTH) + "..."
          : description;

      // Highlight title
      const highlightedTitle = highlightTextUtil(
        node.title,
        "title",
        searchTerm,
        node.searchInfo
      ).html;

      // Highlight description
      const highlightedDescription = highlightTextUtil(
        truncatedDescription,
        "description",
        searchTerm,
        node.searchInfo
      ).html;

      // Highlight namespace
      const highlightedNamespace = highlightTextUtil(
        node.namespace,
        "namespace",
        searchTerm,
        node.searchInfo
      ).html;

      const [isExpanded, setIsExpanded] = useState(false);

      const handleClick = useCallback(() => {
          onClick();
        },
        [onClick]
      );

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

      return (
        <div
          ref={ref}
          className={`search-result-item ${isExpanded ? "expanded" : ""}`}
          css={searchResultStyles(theme)}
          draggable
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="result-header">
            <div className="result-main">
              <div className="result-title-row">
                <Typography
                  className="result-title"
                  component="div"
                  dangerouslySetInnerHTML={{ __html: highlightedTitle }}
                />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Typography className="result-namespace" component="div" dangerouslySetInnerHTML={{ __html: highlightedNamespace }} />
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
            <Typography
              className="result-description"
              component="div"
              dangerouslySetInnerHTML={{ __html: highlightedDescription }}
            />
          )}

          {/* Input/Output info - click to expand */}
          <Collapse in={isExpanded} timeout={150}>
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
