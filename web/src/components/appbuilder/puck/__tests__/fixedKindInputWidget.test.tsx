/**
 * The fixed-kind palette inputs. Each synthesizes a workflow input of its kind
 * and routes it through the editor's property resolver, so the check that
 * matters is that a kind lands on its real editor rather than on a text box.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { getComponentForProperty } from "../../../node/PropertyInput.resolver";
import { createPropertyForInput } from "../../inputProperty";
import type { WorkflowInputKind } from "../../inputKinds";
import { FixedKindInputWidget } from "../WorkflowInputWidget";
import DataframeProperty from "../../../properties/DataframeProperty";
import FilePathProperty from "../../../properties/FilePathProperty";
import FolderPathProperty from "../../../properties/FolderPathProperty";
import Model3DProperty from "../../../properties/Model3DProperty";
import ImageSizeProperty from "../../../properties/ImageSizeProperty";
import ImageListProperty from "../../../properties/ImageListProperty";
import VideoListProperty from "../../../properties/VideoListProperty";
import AudioListProperty from "../../../properties/AudioListProperty";
import StringListProperty from "../../../properties/StringListProperty";

const resolverFor = (kind: WorkflowInputKind) =>
  getComponentForProperty(
    createPropertyForInput({
      nodeId: "n1",
      nodeType: "nodetool.input.Test",
      name: "value",
      label: "Value",
      kind
    })
  );

describe("input kinds resolve to their property editor", () => {
  it.each([
    ["dataframe", DataframeProperty],
    ["file_path", FilePathProperty],
    ["folder_path", FolderPathProperty],
    ["model3d", Model3DProperty],
    ["image_size", ImageSizeProperty],
    ["image_list", ImageListProperty],
    ["video_list", VideoListProperty],
    ["audio_list", AudioListProperty],
    ["text_list", StringListProperty]
  ] as const)("routes %s away from the text box", (kind, expected) => {
    expect(resolverFor(kind)).toBe(expected);
  });
});

describe("FixedKindInputWidget", () => {
  it("labels a path control from the widget's own label", () => {
    const { wrapper: Wrapper } = makeTestRuntime();
    render(
      <ThemeProvider theme={mockTheme}>
        <Wrapper>
          <FixedKindInputWidget
            id="f1"
            kind="file_path"
            label="Source file"
            placeholder="Pick a file…"
          />
        </Wrapper>
      </ThemeProvider>
    );
    // PropertyLabel title-cases whatever name it is given.
    expect(screen.getByText(/Source File/i)).toBeInTheDocument();
    expect(screen.getByText("Pick a file…")).toBeInTheDocument();
  });
});
