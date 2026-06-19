import * as React from "react";
import { ZoomControls, FlexColumn, Text } from "nodetool";

export const Default = () => {
  const [zoom, setZoom] = React.useState(1);
  return <ZoomControls zoom={zoom} onZoomChange={setZoom} showValue showReset />;
};

export const WithoutReset = () => {
  const [zoom, setZoom] = React.useState(1.5);
  return (
    <ZoomControls
      zoom={zoom}
      onZoomChange={setZoom}
      showValue
      showReset={false}
    />
  );
};

export const Levels = () => {
  const [zoomOut, setZoomOut] = React.useState(0.5);
  const [zoomIn, setZoomIn] = React.useState(2.5);
  return (
    <FlexColumn gap={1.5}>
      <Text size="small" color="secondary">zoomed out (50%)</Text>
      <ZoomControls zoom={zoomOut} onZoomChange={setZoomOut} showValue showReset />
      <Text size="small" color="secondary">zoomed in (250%)</Text>
      <ZoomControls zoom={zoomIn} onZoomChange={setZoomIn} showValue showReset />
    </FlexColumn>
  );
};

export const IconOnly = () => {
  const [zoom, setZoom] = React.useState(1);
  return <ZoomControls zoom={zoom} onZoomChange={setZoom} showValue={false} buttonSize="small" />;
};
