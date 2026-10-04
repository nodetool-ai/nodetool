/**
 * The resource router: every kind mobile opens reaches its screen, and a kind
 * it does not open pushes nothing and reports `false`, so the caller can say
 * the document opens on desktop or web.
 */
import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockRoute = jest.fn();

jest.mock("../../../documents/kinds", () => ({
  findDocumentKindInfo: (kind: string) => {
    const route = mockRoute(kind);
    return route === undefined
      ? undefined
      : {
          kind,
          label: kind,
          plural: `${kind}s`,
          icon: "document-outline",
          surface: "viewer",
          route,
          creatable: false,
          agentEditable: false,
        };
  },
}));

import { useOpenResource, type OpenableRef } from "../useOpenResource";

const mockOpened = jest.fn();

/** Calls the hook once on mount; the hook needs a component, nothing more. */
const Opener: React.FC<{ ref_: OpenableRef; name?: string }> = ({
  ref_,
  name,
}) => {
  const open = useOpenResource();
  React.useEffect(() => {
    mockOpened(open(ref_, name));
  }, [name, open, ref_]);
  return <Text>opener</Text>;
};

describe("useOpenResource", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockOpened.mockClear();
    mockRoute.mockReset();
  });

  it("pushes nothing for a kind mobile does not open, and says so", () => {
    mockRoute.mockReturnValue(undefined);

    render(<Opener ref_={{ kind: "script", id: "sc-1" }} name="Pilot" />);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockOpened).toHaveBeenCalledWith(false);
  });

  it("opens a sketch in the sketch viewer", () => {
    mockRoute.mockReturnValue("SketchViewer");

    render(<Opener ref_={{ kind: "sketch", id: "sk-1" }} name="Doodle" />);

    expect(mockNavigate).toHaveBeenCalledWith("SketchViewer", {
      id: "sk-1",
      name: "Doodle",
    });
    expect(mockOpened).toHaveBeenCalledWith(true);
  });

  it("sends an asset to the asset viewer, not a document screen", () => {
    render(<Opener ref_={{ kind: "asset", id: "a-1" }} />);

    expect(mockNavigate).toHaveBeenCalledWith("AssetViewer", {
      assetId: "a-1",
    });
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("pushes the dedicated screen a kind names", () => {
    mockRoute.mockReturnValue("StoryboardEditor");

    render(<Opener ref_={{ kind: "storyboard", id: "sb-1" }} name="Chase" />);

    expect(mockNavigate).toHaveBeenCalledWith("StoryboardEditor", {
      id: "sb-1",
      name: "Chase",
    });
  });
});
