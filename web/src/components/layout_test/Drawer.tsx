/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Drawer,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Box
} from "@mui/material";
import React from "react";

const styles = {
  root: css`
    margin: 8px;
  `,
  list: css`
    width: 250px;
  `,
  fullList: css`
    width: auto;
  `
};

const DrawerDemo = () => {
  const [open, setOpen] = React.useState(false);

  const toggleDrawer = (newOpen: boolean) => () => {
    setOpen(newOpen);
  };

  const DrawerList = (
    <Box sx={{ width: 250 }} role="presentation" onClick={toggleDrawer(false)}>
      <List>
        {["Inbox", "Starred", "Send email", "Drafts"].map((text) => (
          <ListItem key={text} disablePadding>
            <ListItemButton>
              <ListItemText primary={text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <div css={styles.root}>
      <Button onClick={toggleDrawer(true)}>Open drawer</Button>
      <Drawer open={open} onClose={toggleDrawer(false)}>
        {DrawerList}
      </Drawer>
    </div>
  );
};

export default DrawerDemo;
