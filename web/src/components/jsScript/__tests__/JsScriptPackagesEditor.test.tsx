import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import { trpcClient } from "../../../trpc/client";
import { SANDBOX_CONSENT_TEXT } from "../../properties/SandboxPackagesProperty";
import JsScriptPackagesEditor from "../JsScriptPackagesEditor";

const modulesQuery = trpcClient.packs.sandboxModules
  .query as unknown as jest.Mock;

const GEO = {
  specifier: "@acme/geo",
  packName: "@acme/geo",
  packVersion: "1.2.0",
  kind: "js" as const,
  description: "Great-circle distance helpers.",
  contentDigest: "a".repeat(64)
};

const YAML = {
  specifier: "@nodetool-ai/sandbox-yaml",
  packName: "@nodetool-ai/sandbox-yaml",
  packVersion: "0.1.0",
  kind: "js" as const,
  description: "Parse and serialize YAML.",
  contentDigest: "c".repeat(64)
};

function renderEditor(
  props: Partial<React.ComponentProps<typeof JsScriptPackagesEditor>> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const onChange = props.onChange ?? jest.fn();
  return {
    onChange,
    ...render(
      <QueryClientProvider client={client}>
        <ThemeProvider theme={mockTheme}>
          <JsScriptPackagesEditor
            packages={[]}
            onChange={onChange}
            {...props}
          />
        </ThemeProvider>
      </QueryClientProvider>
    )
  };
}

async function openPackagesField() {
  const input = await screen.findByRole("combobox", { name: /packages/i });
  await userEvent.click(input);
  return input;
}

async function removeChip(specifier: string) {
  const chip = await screen.findByRole("button", { name: specifier });
  await userEvent.click(within(chip).getByTestId("CancelIcon"));
}

describe("JsScriptPackagesEditor", () => {
  beforeEach(() => {
    modulesQuery.mockReset();
    modulesQuery.mockResolvedValue({
      modules: [GEO, YAML],
      diagnostics: []
    });
  });

  it("shows the consent sentence and an autocomplete, not a checkbox list", async () => {
    renderEditor();
    expect(screen.getByText(SANDBOX_CONSENT_TEXT)).toBeInTheDocument();
    expect(
      await screen.findByRole("combobox", { name: /packages/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("lists installed packages only after the field is opened", async () => {
    renderEditor();
    await openPackagesField();
    expect(
      await screen.findByRole("option", { name: /@acme\/geo/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /@nodetool-ai\/sandbox-yaml/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Great-circle distance helpers.")
    ).toBeInTheDocument();
  });

  it("filters packages as the user types", async () => {
    renderEditor();
    const input = await openPackagesField();
    await screen.findByRole("option", { name: /@acme\/geo/ });
    await userEvent.type(input, "yaml");
    expect(
      screen.getByRole("option", { name: /@nodetool-ai\/sandbox-yaml/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /@acme\/geo/ })
    ).not.toBeInTheDocument();
  });

  it("writes a declaration stamped with the version and digest", async () => {
    const { onChange } = renderEditor();
    await openPackagesField();
    await userEvent.click(
      await screen.findByRole("option", { name: /@acme\/geo/ })
    );
    expect(onChange).toHaveBeenCalledWith([
      {
        specifier: "@acme/geo",
        resolvedPackVersion: "1.2.0",
        contentDigest: GEO.contentDigest
      }
    ]);
  });

  it("shows selected packages as chips and removes one from the chip", async () => {
    const { onChange } = renderEditor({
      packages: [{ specifier: "@acme/geo", contentDigest: GEO.contentDigest }]
    });
    expect(await screen.findByText("@acme/geo")).toBeInTheDocument();
    await removeChip("@acme/geo");
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows a saved declaration no installed pack answers", async () => {
    renderEditor({
      packages: [
        { specifier: "@acme/geo", contentDigest: GEO.contentDigest },
        { specifier: "@gone/pack", contentDigest: "b".repeat(64) }
      ]
    });
    expect(await screen.findByText("@gone/pack")).toBeInTheDocument();
    expect(
      await screen.findByText(/no installed pack declares them/)
    ).toBeInTheDocument();
  });

  it("removes a missing declaration and keeps the installed ones", async () => {
    const kept = { specifier: "@acme/geo", contentDigest: GEO.contentDigest };
    const stale = { specifier: "@gone/pack", contentDigest: "b".repeat(64) };
    const { onChange } = renderEditor({ packages: [kept, stale] });
    await screen.findByText("@gone/pack");
    await removeChip("@gone/pack");
    expect(onChange).toHaveBeenCalledWith([kept]);
  });

  it("reports nothing missing until the module list actually loads", async () => {
    modulesQuery.mockRejectedValue(new Error("nope"));
    renderEditor({ packages: [{ specifier: "@gone/pack" }] });
    expect(
      await screen.findByText("Installed sandbox packages could not be read.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no installed pack declares them/)
    ).not.toBeInTheDocument();
  });

  it("says so when no sandbox package is installed", async () => {
    modulesQuery.mockResolvedValue({ modules: [], diagnostics: [] });
    renderEditor();
    expect(
      await screen.findByText("No sandbox packages are installed.")
    ).toBeInTheDocument();
  });

  it("keeps an existing declaration when another package is added", async () => {
    const existing = {
      specifier: "@acme/geo",
      contentDigest: GEO.contentDigest
    };
    const { onChange } = renderEditor({ packages: [existing] });
    await openPackagesField();
    await userEvent.click(
      await screen.findByRole("option", { name: /@nodetool-ai\/sandbox-yaml/ })
    );
    expect(onChange).toHaveBeenCalledWith([
      existing,
      {
        specifier: "@nodetool-ai/sandbox-yaml",
        resolvedPackVersion: "0.1.0",
        contentDigest: YAML.contentDigest
      }
    ]);
  });
});
