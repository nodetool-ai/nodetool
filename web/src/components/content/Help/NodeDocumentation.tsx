/** @jsxImportSource @emotion/react */
import React from "react";
import { useParams } from "react-router-dom";
import { useMetadata } from "../../../serverState/useMetadata";
import NodeInfo from "../../node_menu/NodeInfo";
import { css } from "@emotion/react";

const styles = (theme: any) =>
  css`
    padding: 2rem;
    max-width: 600px;
    margin: 0 auto;

    .loading {
      font-size: 1.2rem;
      color: ${theme.palette.c_gray4};
    }

    .error {
      font-size: 1.2rem;
      color: ${theme.palette.c_error};
    }
  `;

const NodeDocumentation: React.FC = () => {
  const { nodeType } = useParams<{ nodeType: string }>();
  const { data, isLoading } = useMetadata();
  const nodeMetadata = nodeType ? data?.metadataByType[nodeType] : null;
  const renderContent = () => {
    if (isLoading) return <div className="loading">Loading...</div>;
    if (!nodeMetadata)
      return <div className="error">No data available for this node type.</div>;
    return <NodeInfo nodeMetadata={nodeMetadata} />;
  };

  return <div css={styles}>{renderContent()}</div>;
};

export default React.memo(NodeDocumentation);
