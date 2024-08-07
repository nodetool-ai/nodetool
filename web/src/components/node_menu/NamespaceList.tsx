/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo } from "react";
import { Box, Divider, List, Tooltip, Typography } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import RenderNamespaces from "./RenderNamespaces";
import RenderNodes from "./RenderNodes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import {
  titleize,
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../node/BaseNode";
import { colorForType, descriptionForType } from "../../config/data_types";
import { TOOLTIP_DELAY } from "../../config/constants";

type NamespaceTree = Record<
  string,
  {
    children: NamespaceTree;
  }
>;

interface NamespaceListProps {
  namespaceTree: NamespaceTree;
  metadata: NodeMetadata[];
}

const namespaceStyles = (theme: any) =>
  css({
    "&": {
      maxHeight: "65vh"
    },
    ".header": {
      display: "flex",
      minHeight: "30px",
      alignItems: "center",
      flexDirection: "row",
      margin: "0 1em .5em 1em"
    },
    ".clear-namespace": {
      padding: "0 ",
      width: ".5em",
      height: "1em",
      color: theme.palette.c_gray4
    },
    ".list-box": {
      display: "flex",
      overflowY: "auto",
      flexDirection: "row",
      alignItems: "stretch",
      gap: "1em",
      marginLeft: "1em"
    },
    ".namespace-list": {
      overflowY: "scroll",
      overflowX: "hidden",
      maxHeight: "60vh",
      minWidth: "220px",
      flexShrink: "1"
    },
    ".node-list": {
      maxHeight: "60vh",
      minWidth: "300px",
      paddingRight: ".5em",
      paddingBottom: "1em",
      flex: "0 1 auto",
      transition: "max-width 1s ease-out, width 1s ease-out",
      overflowX: "hidden",
      overflowY: "scroll"
    },
    ".no-selection": {
      flexDirection: "column",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      wordSpacing: "0",
      margin: 0,
      alignItems: "stretch",
      gap: "1em"
    },
    ".explanation": {
      overflowY: "scroll",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      margin: "0",
      padding: "0 2em 2em .5em"
    },
    ".explanation h5": {
      color: theme.palette.c_hl1,
      marginBottom: "0.3em"
    },
    ".explanation p": {
      fontSize: theme.fontSizeNormal
    },
    ".explanation ul": {
      listStyleType: "square",
      paddingInlineStart: "1em",
      margin: 0,
      "& li": {
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeNormal,
        margin: "0.25em 0",
        padding: "0"
      }
    },

    ".result-info": {
      color: theme.palette.c_white,
      cursor: "default"
    },
    ".result-info span": {
      color: theme.palette.c_gray6
    },
    ".no-selection p": {
      margin: "0",
      padding: "0 0 .5em 0"
    },
    ".no-results": {
      padding: "0 0 0 1em",
      margin: 0
    },
    ".highlighted": {
      paddingLeft: ".25em",
      marginLeft: ".1em",
      borderLeft: `2px solid ${theme.palette.c_hl1}`
    },
    ".node-info": {
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      gap: ".5em",
      paddingRight: "1em",
      maxHeight: "60vh",
      ".node-title": {
        fontSize: theme.fontSizeNormal,
        fontWeight: "600",
        color: theme.palette.c_hl1
      },
      ".node-description": {
        fontSize: theme.fontSizeNormal,
        fontWeight: "400",
        color: theme.palette.c_white
      },
      ".node-tags": {
        fontSize: theme.fontSizeSmall,
        color: theme.palette.c_gray4
      },
      ".node-usecases div": {
        fontSize: theme.fontSizeNormal,
        fontWeight: "200",
        color: theme.palette.c_gray6,
        lineHeight: "1.3em"
      }
    },
    ".inputs-outputs": {
      paddingBottom: "1em"
    },
    ".inputs, .outputs": {
      display: "flex",
      justifyContent: "space-between",
      flexDirection: "column",
      gap: 0
    },
    ".inputs-outputs .item": {
      padding: ".25em 0 .25em 0",
      display: "flex",
      justifyContent: "space-between",
      flexDirection: "row",
      gap: ".5em",
      cursor: "default"
    },
    ".inputs-outputs .item:nth-of-type(odd)": {
      backgroundColor: "#1e1e1e"
    },
    ".inputs-outputs .item .type": {
      color: theme.palette.c_white,
      textAlign: "right",
      fontFamily: theme.fontFamily2,
      borderRight: `4px solid ${theme.palette.c_gray4}`,
      paddingRight: ".5em"
    },
    ".inputs-outputs .item .property": {
      color: theme.palette.c_gray6
    },
    ".inputs-outputs .item .property.description": {
      color: theme.palette.c_white
    },
    ".preview-image": {
      width: "100%",
      height: "auto",
      maxHeight: "320px",
      objectFit: "contain"
    }
  });

const NamespaceList: React.FC<NamespaceListProps> = ({
  namespaceTree,
  metadata
}) => {
  const {
    searchTerm,
    highlightedNamespaces,
    selectedPath,
    setSelectedPath,
    searchResults,
    hoveredNode,
    setHoveredNode
  } = useNodeMenuStore((state) => ({
    searchTerm: state.searchTerm,
    highlightedNamespaces: state.highlightedNamespaces,
    selectedPath: state.selectedPath,
    setSelectedPath: state.setSelectedPath,
    searchResults: state.searchResults,
    hoveredNode: state.hoveredNode,
    setHoveredNode: state.setHoveredNode
  }));

  const handleNamespaceClick = useCallback(
    (namespacePath: string[]) => {
      setHoveredNode(null);
      if (selectedPath.join(".") === namespacePath.join(".")) {
        setSelectedPath(selectedPath.slice(0, -1));
      } else {
        setSelectedPath(namespacePath);
      }
    },
    [selectedPath, setHoveredNode, setSelectedPath]
  );

  const selectedPathString = selectedPath.join(".");

  const currentNodes = useMemo(() => {
    if (!metadata) return [];

    return metadata
      .filter((node) => {
        const startsWithPath = node.namespace.startsWith(
          selectedPathString + "."
        );
        return (
          (selectedPathString === "" && searchTerm !== "") ||
          node.namespace === selectedPathString ||
          startsWithPath
        );
      })
      .sort((a, b) => {
        const namespaceComparison = a.namespace.localeCompare(b.namespace);
        return namespaceComparison !== 0
          ? namespaceComparison
          : a.title.localeCompare(b.title);
      });
  }, [metadata, selectedPathString, searchTerm]);

  const parseDescription = (description: string) => {
    // First line is description, second line tags, followed by list of use cases
    const lines = description.split("\n");
    return {
      desc: lines[0],
      tags: lines.length > 0 ? lines[1] : [],
      useCases: lines.length > 1 ? lines.slice(2) : []
    };
  };

  const description = parseDescription(hoveredNode?.description || "");

  return (
    <div css={namespaceStyles}>
      <Box className="header">
        <Tooltip
          title={
            <span
              style={{
                color: "#eee",
                fontSize: "1.25em"
              }}
            >
              showing the amount of nodes found: <br />
              [in selected namespace | total search results]
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement="bottom"
        >
          <Typography className="result-info">
            <span>
              [{currentNodes?.length} | {searchResults.length}]
            </span>
          </Typography>
        </Tooltip>
      </Box>

      <Box className="list-box">
        <List className="namespace-list">
          <RenderNamespaces
            tree={namespaceTree}
            handleNamespaceClick={handleNamespaceClick}
          />
        </List>
        {currentNodes && currentNodes.length > 0 ? (
          <>
            <List className="node-list">
              <RenderNodes nodes={currentNodes} />
            </List>
            {hoveredNode && (
              <List className="node-info">
                <Typography className="node-title">
                  {titleize(hoveredNode.title)}
                </Typography>
                <Typography className="node-description">
                  {description.desc}
                </Typography>
                <Typography className="node-tags">
                  Tags: {description.tags}
                </Typography>
                <Typography component="div" className="node-usecases">
                  {description.useCases.map((useCase, i) => (
                    <div key={i}>{useCase}</div>
                  ))}
                </Typography>

                {hoveredNode.model_info.cover_image_url && (
                  <img
                    className={"preview-image"}
                    src={hoveredNode.model_info.cover_image_url}
                    alt={hoveredNode.title}
                  />
                )}

                <Divider />

                <div className="inputs-outputs">
                  <div className="inputs">
                    <Typography variant="h4">Inputs</Typography>
                    {hoveredNode.properties.map((property) => (
                      <div key={property.name} className="item">
                        <Tooltip
                          enterDelay={TOOLTIP_DELAY}
                          placement="top-start"
                          title={property.description}
                        >
                          <Typography
                            className={
                              property.description
                                ? "property description"
                                : "property"
                            }
                          >
                            {property.name}
                          </Typography>
                        </Tooltip>
                        <Tooltip
                          enterDelay={TOOLTIP_DELAY}
                          placement="top-end"
                          title={descriptionForType(property.type.type || "")}
                        >
                          <Typography
                            className="type"
                            style={{
                              borderColor: colorForType(property.type.type)
                            }}
                          >
                            {property.type.type}
                          </Typography>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                  <div className="outputs">
                    <Typography variant="h4">Outputs</Typography>
                    {hoveredNode.outputs.map((property) => (
                      <div key={property.name} className="item">
                        <Typography className="property">
                          {property.name}
                        </Typography>
                        <Tooltip
                          enterDelay={TOOLTIP_DELAY}
                          placement="top-end"
                          title={descriptionForType(property.type.type || "")}
                        >
                          <Typography
                            className="type"
                            style={{
                              borderColor: colorForType(property.type.type)
                            }}
                          >
                            {property.type.type}
                          </Typography>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
              </List>
            )}
          </>
        ) : searchTerm.length > 0 && highlightedNamespaces.length > 0 ? (
          <div className="no-selection">
            <p>
              Nothing found in this namespace for
              <strong>[{searchTerm}]</strong>
            </p>
            <ul className="no-results">
              <li>
                click on <span className="highlighted">highlighted </span>
                namespaces to find results.
              </li>
              <li>
                clear the search with [ESC] or by clicking on the X in the
                search bar
              </li>
              <li>just start typing to enter a new search term</li>
            </ul>
          </div>
        ) : (
          <div className="no-selection">
            <div className="explanation">
              <Typography variant="h5" style={{ marginTop: 0 }}>
                Browse Nodes
              </Typography>
              <ul>
                <li>Click on the namespaces to the left</li>
              </ul>

              <Typography variant="h5">Search Nodes</Typography>
              <Typography variant="body1">
                Just start typing while the NodeMenu is open. <br />
                <br />
                To clear the search term:
                <br />
                Press ESC key or the X icon in the search input.
              </Typography>

              <Typography variant="h5">Create Nodes</Typography>
              <ul>
                <li>Click on a node</li>
                <li>Drag nodes on canvas</li>
              </ul>
            </div>
            <List className="node-info">
              <Typography className="node-title"></Typography>
            </List>
          </div>
        )}
      </Box>
    </div>
  );
};

export default NamespaceList;
