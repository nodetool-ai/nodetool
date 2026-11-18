import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import useMetadataStore from "../../../stores/MetadataStore";
import usePendingNodeCreateStore from "../../../stores/PendingNodeCreateStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import QuickActionTiles from "../QuickActionTiles";
import { QUICK_ACTION_NODE_TYPES } from "../../../config/quickActionNodeTypes";
import {
  AI_TASK_ACTIONS,
  BASIC_ACTIONS,
  CONSTANT_NODES,
  PROVIDER_ACTIONS,
  QUICK_ACTION_BUTTONS
} from "../QuickActionTiles.constants";

const renderTiles = (group?: "all" | "basics" | "more") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QuickActionTiles group={group} />
    </ThemeProvider>
  );

const sectionNamed = (title: string): HTMLElement => {
  const section = screen.getByText(title).closest("section");
  if (!section) {
    throw new Error(`No section titled ${title}`);
  }
  return section;
};

describe("QuickActionTiles", () => {
  beforeEach(() => {
    usePendingNodeCreateStore.setState({ pending: null });
  });

  it("gives every boosted node type exactly one tile", () => {
    const tileTypes = [...QUICK_ACTION_BUTTONS, ...CONSTANT_NODES].map(
      (action) => action.nodeType
    );
    expect(new Set(tileTypes).size).toBe(tileTypes.length);
    expect([...tileTypes].sort()).toEqual([...QUICK_ACTION_NODE_TYPES].sort());
  });

  it("binds each tile to the node its label names", () => {
    const byLabel = Object.fromEntries(
      [...QUICK_ACTION_BUTTONS, ...CONSTANT_NODES].map((action) => [
        action.label,
        action.nodeType
      ])
    );
    expect(byLabel["Video to video"]).toBe("nodetool.video.VideoToVideo");
    expect(byLabel["Speech to text"]).toBe(
      "nodetool.text.AutomaticSpeechRecognition"
    );
    expect(byLabel["FalAI"]).toBe("fal.DynamicFal");
    expect(byLabel["Replicate"]).toBe("replicate.DynamicReplicate");
    expect(byLabel["Bool"]).toBe("nodetool.constant.Bool");
    expect(byLabel["Video"]).toBe("nodetool.constant.Video");
  });

  it("keeps provider tiles out of the AI nodes section", () => {
    renderTiles();

    const aiSection = within(sectionNamed("AI nodes"));
    const providerSection = within(sectionNamed("Provider models"));

    expect(PROVIDER_ACTIONS.map((action) => action.label)).toEqual([
      "FalAI",
      "KieAI",
      "Replicate"
    ]);
    for (const action of PROVIDER_ACTIONS) {
      expect(
        providerSection.getByRole("button", { name: action.label })
      ).toBeInTheDocument();
      expect(aiSection.queryByRole("button", { name: action.label })).toBeNull();
    }
    expect(aiSection.getAllByRole("button")).toHaveLength(
      AI_TASK_ACTIONS.length
    );
    expect(sectionNamed("Constants")).toBeInTheDocument();
  });

  it("leads with the basics under task names", () => {
    renderTiles();

    const firstSection = document.querySelector("section");
    expect(firstSection).toBe(sectionNamed("Basics"));
    const basics = within(sectionNamed("Basics"));
    expect(
      basics.getAllByRole("button").map((tile) => tile.getAttribute("aria-label"))
    ).toEqual([
      "Text",
      "Generate text",
      "Generate image",
      "Edit image",
      "Generate video",
      "Edit video"
    ]);
    expect(
      basics.getByRole("button", { name: "Text" }).dataset.nodeType
    ).toBe("nodetool.constant.String");
  });

  it("keeps the basics' nodes out of the AI nodes section", () => {
    const basicTypes = new Set(BASIC_ACTIONS.map((action) => action.nodeType));
    expect(
      AI_TASK_ACTIONS.filter((action) => basicTypes.has(action.nodeType))
    ).toEqual([]);
  });

  it("shows only the requested group", () => {
    const { unmount } = renderTiles("basics");
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.queryByText("AI nodes")).toBeNull();
    unmount();

    renderTiles("more");
    expect(screen.queryByText("Basics")).toBeNull();
    expect(screen.getByText("AI nodes")).toBeInTheDocument();
  });

  it("requests the node when a tile is clicked", async () => {
    const user = userEvent.setup();
    const agent = AI_TASK_ACTIONS[0];
    const metadata = { node_type: agent.nodeType } as NodeMetadata;
    const getMetadata = jest.fn((nodeType: string) =>
      nodeType === agent.nodeType ? metadata : undefined
    );
    useMetadataStore.setState({ getMetadata });
    renderTiles();

    await user.click(screen.getByRole("button", { name: agent.label }));

    expect(usePendingNodeCreateStore.getState().pending?.metadata).toBe(
      metadata
    );
  });
});
