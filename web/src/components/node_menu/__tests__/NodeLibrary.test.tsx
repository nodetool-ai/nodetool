/**
 * NodeLibrary — the header count and the "All" rail count must agree.
 *
 * Hidden nodes stay registered but never appear in the palette, so neither
 * count may include them. Nodes whose provider has no API key are left out
 * the same way until the user chooses to see them.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import NodeLibrary from "../NodeLibrary";
import mockTheme from "../../../__mocks__/themeMock";
import useMetadataStore from "../../../stores/MetadataStore";
import {
  defaultSettings,
  useSettingsStore
} from "../../../stores/SettingsStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";

jest.mock("../NodeInfo", () => ({
  __esModule: true,
  default: () => null
}));

jest.mock("../../../hooks/useSecrets", () => ({
  useSecrets: () => ({
    isApiKeySet: (key: string) =>
      key === "OPENAI_API_KEY" || key === "KIE_API_KEY"
  })
}));

const renderLibrary = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <NodeLibrary activeSubcategory="all" onSubcategoryChange={jest.fn()} />
    </ThemeProvider>
  );

const makeNode = (nodeType: string, hidden = false): NodeMetadata =>
  ({
    node_type: nodeType,
    title: nodeType.split(".").pop() ?? nodeType,
    namespace: nodeType.split(".").slice(0, -1).join("."),
    description: "",
    properties: [],
    outputs: [],
    hidden
  }) as unknown as NodeMetadata;

describe("NodeLibrary counts", () => {
  beforeEach(() => {
    const nodes = [
      makeNode("nodetool.text.Concat"),
      makeNode("nodetool.text.Split"),
      makeNode("nodetool.control.If"),
      makeNode("blender.timeline.BakeTimelineClip", true)
    ];
    useMetadataStore.setState({
      metadata: Object.fromEntries(nodes.map((n) => [n.node_type, n]))
    });
  });

  it("does not count hidden nodes in the All rail count", () => {
    renderLibrary();

    const allTab = screen.getByRole("tab", { name: /All/ });
    expect(allTab).toHaveTextContent("3");
    expect(allTab).not.toHaveTextContent("4");
  });
});

describe("NodeLibrary nodes that need a missing API key", () => {
  beforeEach(() => {
    act(() => {
      useSettingsStore.setState({ settings: { ...defaultSettings } });
    });
    const nodes = [
      makeNode("nodetool.text.Concat"),
      makeNode("openai.text.Chat"),
      makeNode("fal.image.FluxDev"),
      makeNode("replicate.image.Upscale")
    ];
    useMetadataStore.setState({
      metadata: Object.fromEntries(nodes.map((n) => [n.node_type, n]))
    });
  });

  it("leaves out nodes whose provider key is not set", () => {
    renderLibrary();

    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("2");
    expect(
      screen.getByText("2 nodes need an API key you have not added.")
    ).toBeInTheDocument();
  });

  it("shows them after the user asks, and hides them again", () => {
    renderLibrary();

    fireEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("4");
    expect(useSettingsStore.getState().settings.showNodesWithoutKey).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Hide them" }));
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("2");
  });
});

describe("NodeLibrary provider filter", () => {
  beforeEach(() => {
    act(() => {
      useSettingsStore.setState({ settings: { ...defaultSettings } });
    });
    const nodes = [
      makeNode("nodetool.text.Concat"),
      makeNode("nodetool.text.Split"),
      makeNode("openai.text.Chat"),
      makeNode("kie.image.Seedream"),
      makeNode("fal.image.FluxDev")
    ];
    useMetadataStore.setState({
      metadata: Object.fromEntries(nodes.map((n) => [n.node_type, n]))
    });
  });

  it("lists local first, then providers with a key, and filters the library", () => {
    renderLibrary();

    fireEvent.click(
      screen.getByRole("button", { name: "Filter by provider: All providers" })
    );
    const options = screen
      .getAllByRole("menuitemradio")
      .map((item) => item.textContent);
    expect(options).toEqual(["All providers4", "Local2", "Kie1", "OpenAI1"]);

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Kie/ }));

    expect(
      screen.getByRole("button", { name: "Filter by provider: Kie" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("1");

    fireEvent.click(
      screen.getByRole("button", { name: "Filter by provider: Kie" })
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /All providers/ })
    );
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("4");
  });
});
