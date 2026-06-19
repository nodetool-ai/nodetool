import * as React from "react";
import { Breadcrumbs, FlexColumn } from "nodetool";

const path = [
  { label: "Workflows", path: "/workflows" },
  { label: "Image Pipelines", path: "/workflows/image" },
  { label: "Upscale + Caption", path: "/workflows/image/upscale" }
];

export const Default = () => (
  <Breadcrumbs items={path} showHomeIcon />
);

export const Separators = () => (
  <FlexColumn gap={1.5}>
    <Breadcrumbs items={path} separator="chevron" />
    <Breadcrumbs items={path} separator="arrow" />
    <Breadcrumbs items={path} separator="slash" />
  </FlexColumn>
);

export const WithFolders = () => (
  <Breadcrumbs
    items={[
      { label: "Assets", path: "/assets" },
      { label: "Generated", path: "/assets/generated" },
      { label: "2026-06", path: "/assets/generated/2026-06" }
    ]}
    showFolderIcons
    showHomeIcon
  />
);
