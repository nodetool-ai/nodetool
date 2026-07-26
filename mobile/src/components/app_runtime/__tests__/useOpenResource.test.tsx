/**
 * The resource router: every `ResourceKind` reaches a screen. The kind registry
 * is mocked here so the `DocumentViewer` fallback can be exercised on its own —
 * no kind routes there today, and the point of the fallback is the kind that
 * will.
 */
import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import type { ResourceRef } from "@nodetool-ai/app-runtime";

const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockRoute = jest.fn();

jest.mock("../../../documents/kinds", () => ({
  documentKindInfo: (kind: string) => ({
    kind,
    label: kind,
    plural: `${kind}s`,
    icon: "document-outline",
    surface: "viewer",
    route: mockRoute(kind),
    creatable: false,
    agentEditable: false,
  }),
}));

import { useOpenResource } from "../useOpenResource";

/** Calls the hook once on mount; the hook needs a component, nothing more. */
const Opener: React.FC<{ ref_: ResourceRef; name?: string }> = ({
  ref_,
  name,
}) => {
  const open = useOpenResource();
  React.useEffect(() => {
    open(ref_, name);
  }, [name, open, ref_]);
  return <Text>opener</Text>;
};

describe("useOpenResource", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRoute.mockReset();
  });

  it("falls back to DocumentViewer for a kind with no dedicated screen", () => {
    mockRoute.mockReturnValue("DocumentViewer");

    render(<Opener ref_={{ kind: "sketch", id: "sk-1" }} name="Doodle" />);

    expect(mockNavigate).toHaveBeenCalledWith("DocumentViewer", {
      kind: "sketch",
      id: "sk-1",
      name: "Doodle",
    });
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
