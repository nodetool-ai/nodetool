/** @jsxImportSource @emotion/react */
import React from "react";
import { Asset } from "../../stores/ApiTypes";
import { FlexColumn, Text } from "../ui_primitives";

interface PDFViewerProps {
  asset?: Asset;
  url?: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ asset, url }) => {
  const pdfUrl = asset?.get_url || url;

  return (
    <FlexColumn
      fullWidth
      fullHeight
      sx={{ height: "calc(100% - 120px)", marginTop: "1em" }}
    >
      {asset?.content_type && (
        <Text size="small" color="secondary" sx={{ marginBottom: "0.5em" }}>
          {asset.content_type}
        </Text>
      )}
      <iframe
        src={pdfUrl}
        style={{ width: "100%", flex: 1, border: "none" }}
        title="PDF Viewer"
      />
    </FlexColumn>
  );
};

export default PDFViewer;
