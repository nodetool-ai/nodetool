/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { VERSION } from "../../config/constants";
import { Divider } from "@mui/material";

const styles = (theme: Theme) =>
  css({
    li: {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall
    },
    version: {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[100]
    }
  });

type AppIconMenuProps = {
  anchorEl: null | HTMLElement;
  handleClose: () => void;
};

const AppIconMenu: React.FC<AppIconMenuProps> = ({ anchorEl, handleClose }) => {
  const open = Boolean(anchorEl);

  return (
    <Menu
      css={styles}
      anchorEl={anchorEl}
      open={open}
      onContextMenu={(event) => event.preventDefault()}
      onClose={handleClose}
    >
      <MenuItem onClick={handleClose}>
        <a
          href="https://forum.nodetool.ai"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          nodetool Forum
        </a>
      </MenuItem>
      <MenuItem onClick={handleClose}>
        <a
          href="https://github.com/nodetool-ai/nodetool"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          nodetool GitHub
        </a>
      </MenuItem>
      <Divider />
      <MenuItem disabled={true} className={"version"}>
        version {VERSION}
      </MenuItem>
    </Menu>
  );
};

export default AppIconMenu;
