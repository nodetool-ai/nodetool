import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockVideoConstraints = jest.fn();
const mockImageConstraints = jest.fn();

jest.mock("../../../hooks/useMediaModelConstraints", () => ({
  useNodeVideoModelConstraints: (nodeId: string) =>
    mockVideoConstraints(nodeId),
  useNodeImageModelConstraints: (nodeId: string) => mockImageConstraints(nodeId)
}));

jest.mock("../../../config/data_types", () => ({}));

import {
  MediaDurationProperty,
  MediaResolutionVideoProperty,
  MediaAspectRatioVideoProperty,
  MediaResolutionImageProperty
} from "../MediaPickerProperties";

const props = (overrides: Record<string, unknown> = {}) => ({
  property: {
    name: "duration",
    type: { type: "int", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: 5,
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "nodetool.video.TextToVideo",
  ...overrides
});

const renderIn = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

/** Open the chip popover and read back the options it offers. */
const openMenu = () => {
  fireEvent.click(screen.getByRole("button"));
  return screen
    .getAllByRole("menuitemradio")
    .map((el) => el.textContent?.trim() ?? "");
};

beforeEach(() => {
  mockVideoConstraints.mockReturnValue({});
  mockImageConstraints.mockReturnValue({});
});

describe("MediaDurationProperty", () => {
  it("offers the full static ladder when the model declares no durations", () => {
    renderIn(<MediaDurationProperty {...props()} />);
    expect(openMenu()).toEqual([
      "2 Sec",
      "3 Sec",
      "4 Sec",
      "5 Sec",
      "6 Sec",
      "8 Sec",
      "10 Sec",
      "12 Sec",
      "15 Sec"
    ]);
  });

  it("offers only the durations the selected model sells", () => {
    // Veo 3.1 sells 4, 6 and 8 seconds — the 5 the static ladder offers is
    // the value that left the cost row blank.
    mockVideoConstraints.mockReturnValue({ durations: [4, 6, 8] });
    renderIn(<MediaDurationProperty {...props()} />);
    expect(openMenu()).toEqual(["4 Sec", "6 Sec", "8 Sec"]);
  });

  it("surfaces durations the static ladder skips", () => {
    mockVideoConstraints.mockReturnValue({ durations: [7, 9, 11] });
    renderIn(<MediaDurationProperty {...props()} />);
    expect(openMenu()).toEqual(["7 Sec", "9 Sec", "11 Sec"]);
  });

  it("displays a snapped option for an out-of-range stored value", () => {
    mockVideoConstraints.mockReturnValue({ durations: [4, 6, 8] });
    renderIn(<MediaDurationProperty {...props({ value: 5 })} />);
    expect(screen.getByRole("button")).toHaveTextContent("4 Sec");
  });

  it("does not rewrite the stored value on render", () => {
    mockVideoConstraints.mockReturnValue({ durations: [4, 6, 8] });
    const onChange = jest.fn();
    renderIn(<MediaDurationProperty {...props({ value: 5, onChange })} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("writes the value the user picks", () => {
    mockVideoConstraints.mockReturnValue({ durations: [4, 6, 8] });
    const onChange = jest.fn();
    renderIn(<MediaDurationProperty {...props({ value: 5, onChange })} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("6 Sec"));
    expect(onChange).toHaveBeenCalledWith(6);
  });
});

describe("MediaResolutionVideoProperty", () => {
  const resProps = props({
    property: {
      name: "resolution",
      type: { type: "str", optional: false, type_args: [] }
    } as any,
    value: "1080p"
  });

  it("keeps the full ladder when the model declares nothing", () => {
    renderIn(<MediaResolutionVideoProperty {...resProps} />);
    expect(openMenu()).toEqual(["720p", "1080p", "1440p", "4K"]);
  });

  it("narrows to the rungs the model declares", () => {
    mockVideoConstraints.mockReturnValue({ resolutions: ["720p", "1080p"] });
    renderIn(<MediaResolutionVideoProperty {...resProps} />);
    expect(openMenu()).toEqual(["720p", "1080p"]);
  });

  it("keeps the full ladder when no declared rung is expressible", () => {
    // The provider spells its rungs outside the node's own enum; narrowing to
    // nothing would leave an empty menu, so "no overlap" reads as "unknown".
    mockVideoConstraints.mockReturnValue({
      resolutions: ["480p", "720p-SR", "1440p-SR"]
    });
    renderIn(<MediaResolutionVideoProperty {...resProps} />);
    expect(openMenu()).toEqual(["720p", "1080p", "1440p", "4K"]);
  });
});

describe("MediaResolutionImageProperty", () => {
  it("narrows to the model's declared image rungs", () => {
    mockImageConstraints.mockReturnValue({ resolutions: ["1K", "2K"] });
    renderIn(
      <MediaResolutionImageProperty
        {...props({
          property: {
            name: "resolution",
            type: { type: "str", optional: false, type_args: [] }
          } as any,
          value: "1K",
          nodeType: "nodetool.image.TextToImage"
        })}
      />
    );
    expect(openMenu()).toEqual(["1K", "2K"]);
  });
});

describe("MediaAspectRatioVideoProperty", () => {
  const arProps = props({
    property: {
      name: "aspect_ratio",
      type: { type: "str", optional: false, type_args: [] }
    } as any,
    value: "21:9"
  });

  it("narrows to the model's declared ratios and snaps the display", () => {
    mockVideoConstraints.mockReturnValue({ aspectRatios: ["16:9", "9:16"] });
    renderIn(<MediaAspectRatioVideoProperty {...arProps} />);
    expect(screen.getByRole("button")).toHaveTextContent("16:9");
  });
});
