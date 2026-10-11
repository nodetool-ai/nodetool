import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Property } from "../../../stores/ApiTypes";

jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({ asset: undefined, uri: undefined })
}));
jest.mock("../PropertyDropzone", () => ({
  __esModule: true,
  default: ({ showRecorder }: { showRecorder?: boolean }) => (
    <div data-testid="video-dropzone" data-recorder={String(showRecorder)} />
  )
}));

import VideoProperty from "../VideoProperty";

const property = {
  name: "video",
  type: { type: "video", optional: false, type_args: [] }
} as unknown as Property;

const renderFor = (nodeType: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <VideoProperty
        property={property}
        propertyIndex="0"
        value={{ type: "video", uri: "" }}
        onChange={jest.fn()}
        nodeId="node1"
        nodeType={nodeType}
      />
    </ThemeProvider>
  );

describe("VideoProperty", () => {
  it("offers a dropzone without the recorder on processing nodes", () => {
    renderFor("nodetool.video.Trim");
    expect(screen.getByTestId("video-dropzone")).toHaveAttribute(
      "data-recorder",
      "false"
    );
  });

  it("keeps the recorder on Video Input", () => {
    renderFor("nodetool.input.VideoInput");
    expect(screen.getByTestId("video-dropzone")).toHaveAttribute(
      "data-recorder",
      "true"
    );
  });
});
