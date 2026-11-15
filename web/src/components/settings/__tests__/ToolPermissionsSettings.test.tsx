import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ToolPermissionsSettings from "../ToolPermissionsSettings";

const list = jest.fn();
const set = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    settings: {
      toolPermissions: {
        list: { query: () => list() },
        set: { mutate: (input: unknown) => set(input) }
      }
    }
  }
}));

const GROUPS = {
  groups: [
    {
      id: "code",
      title: "Code",
      tools: [
        {
          name: "execute_code",
          description: "Run a code action that changes things.",
          category: "execute",
          rule: "ask"
        }
      ]
    },
    {
      id: "media-generation",
      title: "Media generation",
      tools: [
        {
          name: "generate_image",
          description: "Generate an image from a prompt.",
          category: "external",
          rule: "always_allow"
        }
      ]
    }
  ]
};

const renderSettings = (search = "") =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <ToolPermissionsSettings search={search} />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  list.mockReset().mockResolvedValue(GROUPS);
  set.mockReset();
});

describe("ToolPermissionsSettings", () => {
  it("lists tools under their group with the saved rule selected", async () => {
    renderSettings();
    expect(await screen.findByText("Media generation")).toBeInTheDocument();
    const imageRule = screen.getByRole("group", { name: "Generate image" });
    expect(
      within(imageRule).getByRole("button", { name: "Always allow" })
    ).toHaveAttribute("aria-pressed", "true");
    const codeRule = screen.getByRole("group", { name: "Execute code" });
    expect(within(codeRule).getByRole("button", { name: "Ask" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("saves a new rule and shows it at once", async () => {
    set.mockImplementation(async () => ({
      groups: GROUPS.groups.map((group) => ({
        ...group,
        tools: group.tools.map((tool) =>
          tool.name === "execute_code" ? { ...tool, rule: "always_allow" } : tool
        )
      }))
    }));
    const user = userEvent.setup();
    renderSettings();
    const codeRule = await screen.findByRole("group", { name: "Execute code" });
    await user.click(within(codeRule).getByRole("button", { name: "Always allow" }));
    expect(set).toHaveBeenCalledWith({ name: "execute_code", rule: "always_allow" });
    await waitFor(() =>
      expect(
        within(codeRule).getByRole("button", { name: "Always allow" })
      ).toHaveAttribute("aria-pressed", "true")
    );
  });

  it("filters by the settings search", async () => {
    renderSettings("image");
    expect(await screen.findByText("Generate image")).toBeInTheDocument();
    expect(screen.queryByText("Execute code")).not.toBeInTheDocument();
  });
});
