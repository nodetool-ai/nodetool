/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  CircularProgress
} from "@mui/material";

const listStyles = css({
  overflowY: "auto",
  maxHeight: 520,
  fontSize: "0.92rem"
});

export interface ProviderListProps {
  providers: string[];
  selected: string | null;
  onSelect: (provider: string | null) => void;
  isLoading: boolean;
  isError: boolean;
}

const ProviderList: React.FC<ProviderListProps> = ({
  providers,
  selected,
  onSelect,
  isLoading,
  isError
}) => {
  if (isLoading) {
    return (
      <div css={listStyles} className="model-menu__providers-list is-loading">
        <CircularProgress size={20} />
      </div>
    );
  }
  if (isError) {
    return (
      <div css={listStyles} className="model-menu__providers-list is-error">
        Error loading providers
      </div>
    );
  }
  return (
    <List dense css={listStyles} className="model-menu__providers-list">
      <ListItemButton
        className={`model-menu__provider-item ${
          selected === null ? "is-selected" : ""
        }`}
        selected={selected === null}
        onClick={() => onSelect(null)}
      >
        <ListItemText primary="All providers" />
      </ListItemButton>
      {providers.map((p) => (
        <ListItemButton
          key={p}
          className={`model-menu__provider-item ${
            selected === p ? "is-selected" : ""
          }`}
          selected={selected === p}
          onClick={() => onSelect(p)}
        >
          <ListItemText primary={p} />
        </ListItemButton>
      ))}
    </List>
  );
};

export default ProviderList;
