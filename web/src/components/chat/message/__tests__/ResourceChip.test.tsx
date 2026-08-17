import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import ResourceChip from "../ResourceChip";
import mockTheme from "../../../../__mocks__/themeMock";

const openResource = jest.fn();

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../../hooks/useResolvedMediaUri");
import { mockAssetUrl } from "../../../../hooks/__mocks__/useResolvedMediaUri";

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: (ref: unknown) => openResource(ref),
  canOpenResource: (kind: string) => kind !== "asset" && kind !== "collection" && kind !== "thread"
}));

const renderChip = (uri: string, label: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ResourceChip uri={uri} label={label} />
    </ThemeProvider>
  );

describe("ResourceChip", () => {
  beforeEach(() => {
    openResource.mockClear();
  });

  it("renders the label and opens the resource on click", async () => {
    const user = userEvent.setup();
    renderChip("storyboard://sb_1", "Beach intro");

    const chip = screen.getByRole("button", { name: /Beach intro/ });
    await user.click(chip);

    expect(openResource).toHaveBeenCalledWith({
      kind: "storyboard",
      id: "sb_1"
    });
  });

  it("keeps the sub-target on the parsed ref", async () => {
    const user = userEvent.setup();
    renderChip("timeline://tl_1#clip=cl_9", "Cut 9");

    await user.click(screen.getByRole("button", { name: /Cut 9/ }));

    expect(openResource).toHaveBeenCalledWith({
      kind: "timeline",
      id: "tl_1",
      subTarget: { key: "clip", value: "cl_9" }
    });
  });

  it("renders a thumbnail for image assets", () => {
    const { container } = renderChip("asset://as_1.png", "render.png");

    // Resolved through the asset record, not by rewriting the locator.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      mockAssetUrl("as_1.png")
    );
  });

  it("renders a kind icon instead of a thumbnail for non-image resources", () => {
    const { container } = renderChip("nodetool://workflow/wf_1", "My flow");

    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to plain text for a malformed URI", () => {
    renderChip("unknown-kind://x", "Mystery");

    expect(screen.getByText("Mystery")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
