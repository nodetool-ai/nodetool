import * as React from "react";
import { ListGroup, ListItemRow } from "nodetool";
import FolderIcon from "@mui/icons-material/Folder";
import ImageIcon from "@mui/icons-material/Image";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";

export const Default = () => (
  <div style={{ width: 320 }}>
    <ListGroup>
      <ListItemRow primary="Image Generation" secondary="12 nodes" />
      <ListItemRow primary="Audio Transcription" secondary="5 nodes" />
      <ListItemRow primary="RAG Pipeline" secondary="8 nodes" />
    </ListGroup>
  </div>
);

export const WithIcons = () => (
  <div style={{ width: 320 }}>
    <ListGroup>
      <ListItemRow
        icon={<FolderIcon fontSize="small" />}
        primary="Workflows"
        secondary="24 items"
      />
      <ListItemRow
        icon={<ImageIcon fontSize="small" />}
        primary="Generated images"
        secondary="148 assets"
      />
      <ListItemRow
        icon={<AudiotrackIcon fontSize="small" />}
        primary="Audio clips"
        secondary="9 assets"
      />
    </ListGroup>
  </div>
);

export const Selectable = () => {
  const [selected, setSelected] = React.useState("gpt");
  return (
    <div style={{ width: 320 }}>
      <ListGroup>
        <ListItemRow
          primary="gpt-5.4-mini"
          secondary="OpenAI"
          selected={selected === "gpt"}
          onClick={() => setSelected("gpt")}
        />
        <ListItemRow
          primary="claude-sonnet-4-6"
          secondary="Anthropic"
          selected={selected === "claude"}
          onClick={() => setSelected("claude")}
        />
        <ListItemRow
          primary="gemini-2.5-pro"
          secondary="Google"
          selected={selected === "gemini"}
          onClick={() => setSelected("gemini")}
        />
      </ListGroup>
    </div>
  );
};

export const Compact = () => (
  <div style={{ width: 320 }}>
    <ListGroup compact flush>
      <ListItemRow primary="Node added" secondary="2s ago" />
      <ListItemRow primary="Workflow saved" secondary="1m ago" />
      <ListItemRow primary="Model downloaded" secondary="5m ago" />
    </ListGroup>
  </div>
);
