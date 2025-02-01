/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo } from "react";
import { Typography, Divider, Tooltip, IconButton } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import { colorForType, descriptionForType } from "../../config/data_types";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { titleizeString } from "../../utils/titleizeString";
import CloseIcon from "@mui/icons-material/Close";
import ThemeNodetool from "../themes/ThemeNodetool";
import { highlightText as highlightTextUtil } from "../../utils/highlightText";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";

interface NodeInfoProps {
  nodeMetadata: NodeMetadata;
  onClose?: () => void;
  inPanel?: boolean;
  showConnections?: boolean;
}

const nodeInfoStyles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.palette.c_node_menu,
    overflowY: "auto",
    gap: ".5em",
    padding: "1em",
    maxHeight: "55vh",
    width: "400px",
    position: "relative",
    ".node-title": {
      fontSize: theme.fontSizeNormal,
      fontWeight: "600",
      lineHeight: "1.5em",
      minHeight: "1.5em",
      color: theme.palette.c_hl1,
      marginBottom: "0.25em"
    },
    ".title-container": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      minHeight: "1em"
    },
    ".status-container": {
      minHeight: "1em",
      display: "flex",
      alignItems: "center"
    },
    h4: {
      fontFamily: theme.fontFamily2,
      textTransform: "uppercase",
      padding: "0",
      margin: ".5em 0 0",
      color: theme.palette.c_gray6
    },
    ".replicate-status": {
      fontWeight: "400",
      width: "fit-content",
      color: theme.palette.c_white,
      display: "inline-flex",
      alignItems: "center",
      padding: "0.25em 0.5em",
      borderRadius: "0.25em",
      height: "1.5em"
    },
    ".replicate-status.online": {
      backgroundColor: "#10a37f"
    },
    ".replicate-status.offline": {
      backgroundColor: "#ff4500"
    },
    ".node-description": {
      fontWeight: "400",
      fontSize: theme.fontSizeNormal,
      color: theme.palette.c_white,
      // wordBreak: "break-word",
      whiteSpace: "pre-wrap",
      marginBottom: "0.5em",
      display: "block",
      "& span": {
        display: "inline-block",
        position: "static",
        height: "auto",
        maxHeight: "none",
        lineHeight: "1.2em"
      }
    },
    ".node-tags span": {
      fontWeight: "600",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_black,
      backgroundColor: theme.palette.c_gray4,
      borderRadius: "0.5em",
      padding: "0.2em 0.5em",
      textTransform: "uppercase",
      display: "inline-block",
      cursor: "pointer",
      marginRight: ".5em"
    },
    ".node-usecases div": {
      fontSize: theme.fontSizeNormal,
      fontWeight: "300",
      color: theme.palette.c_gray6,
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
          color: theme.palette.c_gray6
        }
      }
    },
    ".inputs-outputs": {
      paddingBottom: "1em"
    },
    ".inputs-outputs h4": {
      fontSize: theme.fontSizeSmall,
      lineHeight: "2em"
    },
    ".inputs, .outputs": {
      display: "flex",
      justifyContent: "space-between",
      flexDirection: "column",
      gap: 0
    },
    ".inputs-outputs .item": {
      padding: ".25em 0 .25em 4em",
      display: "flex",
      justifyContent: "space-between",
      fontFamily: theme.fontFamily2,
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
      minHeight: "200px",
      maxHeight: "320px",
      objectFit: "contain"
    }
  });

const NodeInfo: React.FC<NodeInfoProps> = ({
  nodeMetadata,
  onClose,
  inPanel = false,
  showConnections = true
}) => {
  const searchTerm = useNodeMenuStore((state) => state.searchTerm);
  const setSearchTerm = useNodeMenuStore((state) => state.setSearchTerm);

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

  const descHtml = highlightTextUtil(
    description.description,
    "description",
    searchTerm,
    nodeMetadata.searchInfo
  ).html;

  return (
    <div css={nodeInfoStyles}>
      <div className="title-container">
        <Typography className="node-title">
          {titleizeString(nodeMetadata.title)}
        </Typography>
        {onClose && (
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: (theme) => theme.palette.c_gray4,
              "&:hover": {
                color: (theme) => theme.palette.c_white
              }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </div>
      <div className="status-container">
        {replicateStatus !== "unknown" && (
          <Typography className={`replicate-status ${replicateStatus}`}>
            {replicateStatus}
          </Typography>
        )}
      </div>
      <div className="node-description">
        <span
          dangerouslySetInnerHTML={{
            __html: descHtml
          }}
        />
      </div>
      <Typography className="node-tags">
        {renderTags(description.tags.join(", "))}
      </Typography>
      <Typography component="div" className="node-usecases">
        {description.useCases.raw && (
          <>
            <h4>Use cases</h4>
            <div
              dangerouslySetInnerHTML={{
                __html: description.useCases.html
              }}
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
            src={nodeMetadata.the_model_info.cover_image_url}
            alt={nodeMetadata.title}
          />
        )
      ) : null}

      <Divider />

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

export default NodeInfo;
