import * as React from "react";
import { DataTable, Chip } from "nodetool";

const columns = [
  { key: "name", label: "Node" },
  { key: "type", label: "Type", width: 120 },
  { key: "time", label: "Time", width: 90, align: "right" as const }
];

const rows = [
  { name: "Load Image", type: "image", time: "0.12s" },
  { name: "Generate Caption", type: "llm", time: "1.84s" },
  { name: "Upscale 2x", type: "image", time: "2.41s" },
  { name: "Save Output", type: "asset", time: "0.08s" }
];

export const Basic = () => (
  <div style={{ width: 420 }}>
    <DataTable columns={columns} rows={rows} />
  </div>
);

export const CompactStriped = () => (
  <div style={{ width: 420 }}>
    <DataTable columns={columns} rows={rows} compact striped bordered />
  </div>
);

export const WithRenderer = () => {
  const statusColumns = [
    { key: "model", label: "Model" },
    {
      key: "status",
      label: "Status",
      width: 130,
      render: (val: React.ReactNode) => (
        <Chip
          label={val}
          color={val === "ready" ? "success" : val === "downloading" ? "primary" : "default"}
          compact
        />
      )
    }
  ];
  const statusRows = [
    { model: "flux-dev", status: "ready" },
    { model: "qwen-image", status: "downloading" },
    { model: "wan-2.2", status: "queued" }
  ];
  return (
    <div style={{ width: 420 }}>
      <DataTable columns={statusColumns} rows={statusRows} />
    </div>
  );
};
