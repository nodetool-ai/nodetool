/**
 * Upload completion for the four media list properties. They share one
 * pattern: files upload asynchronously and are appended when they finish.
 */
import React from "react";
import { act, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";
import type { Asset, Property } from "../../../stores/ApiTypes";
import { useNotificationStore } from "../../../stores/NotificationStore";
import type { PropertyProps } from "../../node/PropertyInput";
import ImageListProperty from "../ImageListProperty";
import AudioListProperty from "../AudioListProperty";
import VideoListProperty from "../VideoListProperty";
import TextListProperty from "../TextListProperty";

interface PendingUpload {
  file: File;
  onCompleted: (asset: Asset) => void;
  onFailed: (error: string) => void;
}

const pendingUploads: PendingUpload[] = [];

jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: (upload: PendingUpload) => {
      pendingUploads.push(upload);
    },
    isUploading: false
  })
}));
jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({ uri: undefined })
}));
jest.mock("../../../hooks/nodes/useNodeIO", () => ({
  __esModule: true,
  useUpstreamValue: () => undefined
}));
jest.mock("../../node/ImageDimensions", () => ({
  __esModule: true,
  default: () => null
}));

const { render } = nodeStoreRenderers(
  makeNodeStore({ nodes: [], edges: [], findNode: () => undefined })
);

type ListItem = { type: string; uri: string; asset_id?: string };

const cases: Array<{
  name: string;
  Component: React.ComponentType<PropertyProps>;
  kind: string;
  mime: string;
}> = [
  { name: "ImageListProperty", Component: ImageListProperty, kind: "image", mime: "image/png" },
  { name: "AudioListProperty", Component: AudioListProperty, kind: "audio", mime: "audio/wav" },
  { name: "VideoListProperty", Component: VideoListProperty, kind: "video", mime: "video/mp4" },
  { name: "TextListProperty", Component: TextListProperty, kind: "text", mime: "text/plain" }
];

const asset = (id: string, contentType: string): Asset =>
  ({ id, content_type: contentType }) as Asset;

describe.each(cases)("$name uploads", ({ Component, kind, mime }) => {
  const property = {
    name: "items",
    type: { type: `${kind}_list`, optional: false, type_args: [] }
  } as unknown as Property;

  const ui = (value: ListItem[], onChange: jest.Mock) => (
    <ThemeProvider theme={mockTheme}>
      <Component
        property={property}
        propertyIndex="0"
        value={value}
        onChange={onChange}
        nodeId="node1"
        nodeType="test.node"
      />
    </ThemeProvider>
  );

  const pickFiles = (container: HTMLElement, names: string[]) => {
    const input = container.querySelector('input[type="file"]');
    if (!input) {
      throw new Error("file input not rendered");
    }
    fireEvent.change(input, {
      target: { files: names.map((n) => new File(["x"], n, { type: mime })) }
    });
  };

  beforeEach(() => {
    pendingUploads.length = 0;
    useNotificationStore.setState({ notifications: [] });
  });

  it("appends to the list as it is when the upload finishes", async () => {
    const onChange = jest.fn();
    const existing: ListItem = { type: kind, uri: "asset://old" };
    const { container, rerender } = render(ui([existing], onChange));

    pickFiles(container, ["new"]);
    expect(pendingUploads).toHaveLength(1);

    // The existing item is removed while the file uploads.
    rerender(ui([], onChange));

    await act(async () => {
      pendingUploads[0].onCompleted(asset("new", mime));
    });

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ asset_id: "new" })
    ]);
  });

  it("keeps the successful uploads when one fails, and reports the failure", async () => {
    const onChange = jest.fn();
    const { container } = render(ui([], onChange));

    pickFiles(container, ["bad", "good"]);
    expect(pendingUploads).toHaveLength(2);

    await act(async () => {
      pendingUploads[0].onFailed("quota exceeded");
      pendingUploads[1].onCompleted(asset("good", mime));
    });

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ asset_id: "good" })
    ]);
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toEqual([
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("quota exceeded")
      })
    ]);
  });
});
