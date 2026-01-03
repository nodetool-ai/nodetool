/** @jsxImportSource @emotion/react */
import { memo, useCallback, forwardRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Box, Collapse } from "@mui/material";
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
      padding: "12px 16px",
      margin: "4px 0",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      border: "1px solid transparent",
      backgroundColor: "transparent",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        border: `1px solid ${theme.vars.palette.divider}`
      },
      ".result-header": {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        marginBottom: "4px"
      },
      ".result-title": {
        fontSize: "1rem",
        fontWeight: 600,
        color: theme.vars.palette.text.primary,
        lineHeight: 1.3,
        "& .highlight": {
          color: "var(--palette-primary-main)"
        }
      },
      ".result-namespace": {
        fontSize: "0.75rem",
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      },
      ".result-description": {
        fontSize: "0.85rem",
        color: theme.vars.palette.text.secondary,
        lineHeight: 1.4,
        marginTop: "4px",
        "& .highlight": {
          color: "var(--palette-primary-main)"
        }
      },
      ".result-tags": {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        marginTop: "6px"
      },
      ".result-tag": {
        fontSize: "0.7rem",
        padding: "2px 6px",
        borderRadius: "4px",
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
        fontSize: "0.75rem"
      },
      ".io-label": {
        color: theme.vars.palette.text.secondary,
        minWidth: "50px",
        textTransform: "uppercase",
        letterSpacing: "0.3px"
      },
      ".io-items": {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px"
      },
      ".io-item": {
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "0.7rem",
        borderLeft: "3px solid",
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

const SearchResultItem = memo(
  forwardRef<HTMLDivElement, SearchResultItemProps>(
    ({ node, onDragStart, onDragEnd, onClick }, ref) => {
      const theme = useTheme();
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);
      const [isHovered, setIsHovered] = useState(false);

      // Parse description and tags
      const { description, tags } = formatNodeDocumentation(
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

      // Check which tags matched
      const matchedTags = new Set<string>();
      if (node.searchInfo?.matches) {
        node.searchInfo.matches
          .filter((m) => m.key === "tags")
          .forEach((match) => {
            // Find which tag was matched
            const tagsStr = tags.join(", ");
            match.indices.forEach(([start, end]) => {
              const matchedText = tagsStr.slice(start, end + 1).toLowerCase();
              tags.forEach((tag) => {
                if (tag.toLowerCase().includes(matchedText)) {
                  matchedTags.add(tag);
                }
              });
            });
          });
      }

      const handleClick = useCallback(() => {
          onClick();
        },
        [onClick]
      );

      const handleMouseEnter = useCallback(() => {
        setIsHovered(true);
      }, []);

      const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
      }, []);

      return (
        <div
          ref={ref}
          className="search-result-item"
          css={searchResultStyles(theme)}
          draggable
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="result-header">
            <Typography
              className="result-title"
              component="div"
              dangerouslySetInnerHTML={{ __html: highlightedTitle }}
            />
            <Typography className="result-namespace" component="div">
              {node.namespace}
            </Typography>
          </div>

          {truncatedDescription && (
            <Typography
              className="result-description"
              component="div"
              dangerouslySetInnerHTML={{ __html: highlightedDescription }}
            />
          )}

          {/* Show matched tags or all tags if any matched */}
          {(matchedTags.size > 0 || tags.length > 0) && (
            <Box className="result-tags">
              {tags.slice(0, 5).map((tag, idx) => (
                <span
                  key={idx}
                  className={`result-tag ${matchedTags.has(tag) ? "matched" : ""}`}
                >
                  {tag}
                </span>
              ))}
            </Box>
          )}

          {/* Input/Output info on hover */}
          <Collapse in={isHovered} timeout={150}>
            <Box className="io-info">
              {node.properties.length > 0 && (
                <Box className="io-row">
                  <span className="io-label">Input:</span>
                  <Box className="io-items">
                    {node.properties.slice(0, 4).map((prop) => (
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
                    {node.properties.length > 4 && (
                      <span className="io-item" style={{ borderColor: "#666" }}>
                        +{node.properties.length - 4}
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
