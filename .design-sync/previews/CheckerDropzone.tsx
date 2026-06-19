import * as React from "react";
import { CheckerDropzone, FlexColumn } from "nodetool";
import ImageIcon from "@mui/icons-material/Image";

export const Default = () => (
  <div style={{ width: 320, height: 180 }}>
    <CheckerDropzone message="Drop an image asset here" icon={<ImageIcon />} />
  </div>
);

export const MessageOnly = () => (
  <div style={{ width: 320, height: 160 }}>
    <CheckerDropzone message="Drag a file to set the node input" />
  </div>
);

export const LargeChecker = () => (
  <div style={{ width: 320, height: 180 }}>
    <CheckerDropzone
      message="Transparent PNG preview"
      icon={<ImageIcon />}
      checkerSize={20}
    />
  </div>
);
