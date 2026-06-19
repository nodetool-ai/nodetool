import * as React from "react";
import { MetadataListRow, ListGroup, Chip } from "nodetool";

export const Default = () => (
  <div style={{ width: 380 }}>
    <MetadataListRow
      primary="image_generation.json"
      metadata={[{ value: "2.4 MB" }, { value: "edited 5m ago" }]}
    />
  </div>
);

export const WithLabels = () => (
  <div style={{ width: 380 }}>
    <MetadataListRow
      primary="claude-sonnet-4-6"
      metadata={[
        { label: "context", value: "200K" },
        { label: "cost", value: "$3 / 1M" }
      ]}
    />
  </div>
);

export const WithActions = () => (
  <div style={{ width: 380 }}>
    <MetadataListRow
      primary="v3 — Add upscaler node"
      metadata={[{ value: "1.1 MB" }, { value: "yesterday" }]}
      actions={<Chip label="current" size="small" color="success" />}
    />
  </div>
);

export const List = () => (
  <div style={{ width: 380 }}>
    <ListGroup>
      <MetadataListRow
        primary="Workflow run #1284"
        secondary="Completed in 12.4s"
        metadata={[{ value: "8 nodes" }, { value: "GPU" }]}
      />
      <MetadataListRow
        primary="Workflow run #1283"
        secondary="Failed at Generate Image"
        metadata={[{ value: "8 nodes" }, { value: "CPU" }]}
      />
      <MetadataListRow
        primary="Workflow run #1282"
        secondary="Completed in 9.1s"
        metadata={[{ value: "6 nodes" }, { value: "GPU" }]}
      />
    </ListGroup>
  </div>
);
