/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useParams } from "react-router-dom";
import NodeInfo from "../../node_menu/NodeInfo";
import useMetadataStore from "../../../stores/MetadataStore";

const styles = (theme: Theme) =>
  css`
    min-height: 100vh;
    width: 100%;
    box-sizing: border-box;
    padding: 3rem 1.5rem;
    background-color: ${theme.vars.palette.c_editor_bg_color};
    background-image: radial-gradient(
      circle,
      ${theme.vars.palette.c_editor_grid_color} 1px,
      transparent 1px
    );
    background-size: 20px 20px;
    background-position: 0 0;
    color: ${theme.vars.palette.text.primary};

    .doc-card {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem;
      background-color: ${theme.vars.palette.background.paper};
      border: 1px solid ${theme.vars.palette.divider};
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    }

    .loading {
      font-size: 1.2rem;
      color: ${theme.vars.palette.text.secondary};
    }

    .error {
      font-size: 1.2rem;
      color: ${theme.vars.palette.error.main};
    }
  `;

const NodeDocumentation: React.FC = () => {
  const theme = useTheme();
  const { nodeType } = useParams<{ nodeType: string }>();
  const nodeMetadata = useMetadataStore((state) =>
    state.getMetadata(nodeType ?? "")
  );
  const renderContent = () => {
    if (!nodeMetadata)
      {return <div className="error">No data available for this node type.</div>;}
    return <NodeInfo nodeMetadata={nodeMetadata} />;
  };

  return (
    <div css={styles(theme)}>
      <div className="doc-card">{renderContent()}</div>
    </div>
  );
};

export default React.memo(NodeDocumentation);
