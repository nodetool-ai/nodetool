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
  maxHeight: 440
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
      <div css={listStyles}>
        <CircularProgress size={20} />
      </div>
    );
  }
  if (isError) {
    return <div css={listStyles}>Error loading providers</div>;
  }
  return (
    <List dense css={listStyles}>
      <ListItemButton
        selected={selected === null}
        onClick={() => onSelect(null)}
      >
        <ListItemText primary="All providers" />
      </ListItemButton>
      {providers.map((p) => (
        <ListItemButton
          key={p}
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
