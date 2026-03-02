/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { Typography, Divider, Tooltip } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import { colorForType, descriptionForType } from "../../config/data_types";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { titleizeString } from "../../utils/titleizeString";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";
import { HighlightText } from "../ui_primitives/HighlightText";
import isEqual from "lodash/isEqual";

interface NodeInfoProps {
  nodeMetadata: NodeMetadata;
  showConnections?: boolean;
  menuWidth?: number;
}

const nodeInfoStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    gap: ".5em",
    padding: "0.75em 1em 1em 1em",
    maxHeight: "55vh",
    position: "relative",
    ".node-title": {
      color: theme.vars.palette.text.primary,
      marginBottom: "0.25em"
    },
    ".title-container": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      minHeight: "1em"
    },
    ".status-container": {
      display: "flex",
      alignItems: "center"
    },
    h4: {
      color: theme.vars.palette.text.secondary
    },
    ".replicate-status": {
      fontWeight: "400",
      width: "fit-content",
      color: theme.vars.palette.grey[0],
      display: "inline-flex",
      alignItems: "center",
      padding: "0.25em 0.5em",
      borderRadius: "0.25em",
      height: "1.5em"
    },
    ".replicate-status.online": {
      backgroundColor: "success.main"
    },
    ".replicate-status.offline": {
      backgroundColor: "error.main"
    },
    ".node-description": {
      fontWeight: 400,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      marginBottom: ".5em",
      display: "block",
      "& span": {
        display: "inline-block",
        position: "static",
        height: "auto",
        maxHeight: "none",
        lineHeight: "1.3em"
      }
    },
    ".node-tags span": {
      fontWeight: 500,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      padding: "4px 8px",
      textTransform: "uppercase",
      display: "inline-block",
      cursor: "pointer",
      marginRight: ".5em",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".node-usecases": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: "300",
      color: theme.vars.palette.text.secondary,
      lineHeight: "1.3em",
      ul: {
        margin: "0.5em 0",
        paddingLeft: "0"
      },
      li: {
        position: "relative",
        marginBottom: "0.25em",
        paddingLeft: "1.5em",
        listStyleType: "none",
        "&::before": {
          content: '"•"',
          position: "absolute",
          left: "0.5em",
          color: theme.vars.palette.text.secondary
        }
      }
    },
    ".inputs-outputs": {
      paddingBottom: "1em"
    },
    ".inputs-outputs h4": {
      fontFamily: theme.fontFamily2,
      fontSize: "0.85rem",
      lineHeight: "2em",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    ".inputs, .outputs": {
      display: "flex",
      justifyContent: "space-between",
      flexDirection: "column",
      gap: 0
    },
    ".inputs-outputs .item": {
      padding: ".25em 0 .25em .5em",
      display: "flex",
      justifyContent: "space-between",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      flexDirection: "row",
      gap: ".5em",
      cursor: "default"
    },
    ".inputs-outputs .item:nth-of-type(odd)": {
      backgroundColor: theme.vars.palette.action.hover
    },
    ".inputs-outputs .item .type": {
      color: theme.vars.palette.text.primary,
      textAlign: "right",
      borderRight: `4px solid ${theme.vars.palette.divider}`,
      paddingRight: ".5em"
    },
    ".inputs-outputs .item .property": {
      color: theme.vars.palette.text.secondary
    },
    ".inputs-outputs .item .property.description": {
      color: theme.vars.palette.text.primary
    },
    ".preview-image": {
      width: "100%",
      height: "auto",
      minHeight: "200px",
      maxHeight: "320px",
      objectFit: "contain"
    }
  });

const NodeInfo: React.FC<NodeInfoProps> = ({
  nodeMetadata,
  menuWidth = 300,
  showConnections = true
}) => {
  const searchTerm = useNodeMenuStore((state) => state.searchTerm);
  const setSearchTerm = useNodeMenuStore((state) => state.setSearchTerm);
  // const description = useMemo(
  //   () => nodeMetadata?.description || "",
  //   [nodeMetadata]
  // );

  const description = useMemo(
    () =>
      formatNodeDocumentation(
        nodeMetadata?.description || "",
        searchTerm,
        nodeMetadata.searchInfo
      ),
    [nodeMetadata, searchTerm]
  );

  const fetchReplicateStatus = useCallback(async () => {
    if (nodeMetadata.node_type.startsWith("replicate.")) {
      const { data, error } = await client.GET("/api/nodes/replicate_status", {
        params: {
          query: {
            node_type: nodeMetadata.node_type
          }
        }
      });
      if (error) {
        return "unknown";
      }
      return data;
    }
    return "unknown";
  }, [nodeMetadata]);

  const { data: replicateStatus, isLoading } = useQuery({
    queryKey: ["replicateStatus", nodeMetadata.node_type],
    queryFn: fetchReplicateStatus
  });

  const handleTagClick = useCallback(
    (tag: string) => {
      setSearchTerm(tag.trim());
    },
    [setSearchTerm]
  );

  const renderTags = (tags: string = "") => {
    return tags?.split(",").map((tag, index) => (
      <span
        onClick={() => {
          handleTagClick(tag.trim());
        }}
        key={index}
        className="tag"
      >
        {tag.trim()}
      </span>
    ));
  };

  const theme = useTheme();
  return (
    <div css={nodeInfoStyles(theme)} style={{ width: menuWidth }}>
      <div className="title-container">
        <Typography className="node-title">
          {titleizeString(nodeMetadata.title)}
        </Typography>
      </div>
      <div
        className="status-container"
        style={{ minHeight: replicateStatus !== "unknown" ? "1em" : "0" }}
      >
        {replicateStatus !== "unknown" && (
          <Typography className={`replicate-status ${replicateStatus}`}>
            {replicateStatus}
          </Typography>
        )}
      </div>
      <div className="node-description">
        <HighlightText
          text={description.description}
          query={searchTerm}
          matchStyle="primary"
        />
      </div>
      <Typography className="node-tags">
        {renderTags(description.tags.join(", "))}
      </Typography>
      <Typography component="div" className="node-usecases">
        {description.useCases.raw && (
          <>
            <HighlightText
              text={description.useCases.raw}
              query={searchTerm}
              matchStyle="primary"
              isBulletList={true}
            />
          </>
        )}
      </Typography>

      {nodeMetadata.the_model_info.cover_image_url ? (
        isLoading ? (
          <div className="preview-image loading"></div>
        ) : (
          <img
            className="preview-image"
            src={nodeMetadata.the_model_info.cover_image_url as string}
            alt={nodeMetadata.title}
          />
        )
      ) : null}

      <Divider sx={{ opacity: 0.5, margin: ".1em 0" }} />

      {showConnections && (
        <div className="inputs-outputs">
          <div className="inputs">
            <Typography variant="h4">Inputs</Typography>
            {nodeMetadata.properties.map((property) => (
              <div key={property.name} className="item">
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  placement="top-start"
                  title={property.description}
                >
                  <Typography
                    className={
                      property.description ? "property description" : "property"
                    }
                  >
                    {property.name}
                  </Typography>
                </Tooltip>
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
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
            {nodeMetadata.outputs.map((property) => (
              <div key={property.name} className="item">
                <Typography className="property">{property.name}</Typography>
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
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
      )}
    </div>
  );
};

export default memo(NodeInfo, isEqual);
