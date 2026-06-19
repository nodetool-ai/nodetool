import * as React from "react";
import { ListGroup, ListItemRow } from "nodetool";
import SettingsIcon from "@mui/icons-material/Settings";
import KeyIcon from "@mui/icons-material/Key";

export const TextOnly = () => (
  <div style={{ width: 320 }}>
    <ListGroup>
      <ListItemRow primary="Provider" secondary="Configure your AI model provider" />
      <ListItemRow primary="Storage" secondary="Local and S3 asset storage" />
    </ListGroup>
  </div>
);

export const WithIcon = () => (
  <div style={{ width: 320 }}>
    <ListGroup>
      <ListItemRow
        icon={<SettingsIcon fontSize="small" />}
        primary="General settings"
        secondary="Theme, language, shortcuts"
        onClick={() => {}}
      />
      <ListItemRow
        icon={<KeyIcon fontSize="small" />}
        primary="API keys"
        secondary="OpenAI, Anthropic, FAL"
        onClick={() => {}}
      />
    </ListGroup>
  </div>
);

export const SelectedState = () => (
  <div style={{ width: 320 }}>
    <ListGroup>
      <ListItemRow primary="Editor" onClick={() => {}} selected />
      <ListItemRow primary="Assets" onClick={() => {}} />
      <ListItemRow primary="Logs" onClick={() => {}} />
    </ListGroup>
  </div>
);
