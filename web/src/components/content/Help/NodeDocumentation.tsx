/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useParams } from "react-router-dom";
import NodeInfo from "../../node_menu/NodeInfo";
import useMetadataStore from "../../../stores/MetadataStore";

const styles = (theme: Theme) =>
  css`
    padding: 2rem;
    max-width: 600px;
    margin: 0 auto;

    .loading {
      font-size: 1.2rem;
      color: ${theme.vars.palette.grey[400]};
    }

    .error {
      font-size: 1.2rem;
      color: ${theme.vars.palette.error.main};
    }
  `;

const NodeDocumentation: React.FC = () => {
  const { nodeType } = useParams<{ nodeType: string }>();
  const nodeMetadata = useMetadataStore((state) =>
    state.getMetadata(nodeType ?? "")
  );
  const renderContent = () => {
    if (!nodeMetadata)
      return <div className="error">No data available for this node type.</div>;
    return <NodeInfo nodeMetadata={nodeMetadata} />;
  };

  return <div css={styles}>{renderContent()}</div>;
};

export default React.memo(NodeDocumentation);
