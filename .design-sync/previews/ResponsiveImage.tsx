import * as React from "react";
import { ResponsiveImage, FlexRow } from "nodetool";

export const AspectRatios = () => (
  <FlexRow gap={2} align="flex-start">
    <div style={{ width: 200 }}>
      <ResponsiveImage
        src="https://picsum.photos/id/1015/640/360"
        alt="Generated landscape"
        aspectRatio="16/9"
        borderRadius={8}
      />
    </div>
    <div style={{ width: 120 }}>
      <ResponsiveImage
        src="https://picsum.photos/id/1025/400/400"
        alt="Generated square"
        aspectRatio="1/1"
        borderRadius={8}
      />
    </div>
  </FlexRow>
);

export const Avatar = () => (
  <div style={{ width: 96 }}>
    <ResponsiveImage
      src="https://picsum.photos/id/64/200/200"
      alt="User avatar"
      aspectRatio="1/1"
      fit="cover"
      borderRadius="50%"
    />
  </div>
);

export const Fit = () => (
  <FlexRow gap={2} align="flex-start">
    <div style={{ width: 160 }}>
      <ResponsiveImage
        src="https://picsum.photos/id/1003/600/400"
        alt="Cover fit"
        aspectRatio="1/1"
        fit="cover"
        borderRadius={8}
      />
    </div>
    <div style={{ width: 160 }}>
      <ResponsiveImage
        src="https://picsum.photos/id/1003/600/400"
        alt="Contain fit"
        aspectRatio="1/1"
        fit="contain"
        borderRadius={8}
      />
    </div>
  </FlexRow>
);

export const ErrorFallback = () => (
  <div style={{ width: 160 }}>
    <ResponsiveImage
      src="https://example.invalid/missing-asset.png"
      alt="Missing asset"
      aspectRatio="16/9"
      borderRadius={8}
    />
  </div>
);
